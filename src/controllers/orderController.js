// Add these 4 imports at the top of orderController.js
const {
  resolveDeliveryStage,
  buildStageTimeline,
} = require("../utils/deliveryStageHelper");
const {
  evaluateCancellationPolicy,
  getCancelReasonCode,
  getCancellationWindowRemaining,
} = require("../utils/cancellationPolicyHelper");
const { calculatePartialRefund } = require("../utils/refundCalculator");
const { sendCancellationEmails } = require("../utils/sendCancellationEmails");
const {
  cancelShipment,
  trackShipment: delhiveryTrack,
  getDelhiveryConfig,
  getLabel: delhiveryGetLabel,
} = require("../services/delhivery/delhiveryApi");
const fetch = require("node-fetch");
const {
  Order,
  OrderItem,
  Product,
  Cart,
  CartItem,
  ProductImage,
  ProductAvailableModels,
  MobileModels,
} = require("../models");
const { resolveCartLineUnitPrice } = require("../utils/cartLinePriceHelper");
const commonUtils = require("./commonUtils");
const {
  getPaidOrderCount,
  getUpiDiscountPercent,
} = require("../utils/upiDiscountHelper");
const { createInvoicePdf } = require("../utils/invoiceGenerator");
const { buildOrderNumber } = require("../utils/orderNumberHelper");
const {
  createReviewRemindersForDeliveredOrder,
} = require("../services/reviewReminderService");

const { safeStatusUpdate } = require("../utils/orderStatusHelper");
const { getDeliveryEstimate } = require("../services/delhivery/deliveryEstimate");
const { normalizePreferredPaymentMethod, getEffectiveRefundType, isCodOrder } = require("../utils/paymentMethodHelper");
const { pendingOrderWhere, isPendingOrderExpired, getPendingOrderTtlMinutes, getPendingOrderCutoffDate } = require("../utils/pendingOrderHelper");
const { validateCodEligibility } = require("../utils/codValidationHelper");
const { fulfillOrder, restoreCartItemsForUser } = require("../services/orderFulfillmentService");
const { buildPayuPaymentForOrder } = require("./paymentController");
const { sequelize } = require("../config/db");
const { Op } = require("sequelize");

const DELIVERY_ESTIMATE_ORDER_ATTRS = [
  "estimatedDeliveryFrom",
  "estimatedDeliveryTo",
  "tatDaysAtOrder",
  "deliveryEstimateLabel",
];

const CORE_ORDER_RESPONSE_ATTRS = [
  "id",
  "userId",
  "totalAmount",
  "subtotal",
  "discountAmount",
  "upiDiscountPercent",
  "preferredPaymentMethod",
  "orderNumberForUser",
  "orderNumber",
  "firstName",
  "lastName",
  "mobileNumber",
  "emailAddress",
  "flatNumber",
  "buildingName",
  "fullAddress",
  "townOrCity",
  "country",
  "state",
  "pinCode",
  "status",
  "payuTxnId",
  "payuPaymentId",
  "paymentMode",
  "bankRefNo",
  "payuStatus",
  "payuError",
  "shipmentId",
  "awbCode",
  "shipmentStatus",
  "shippingLabelUrl",
  "cancelledAt",
  "refundType",
  "refundAmount",
  "refundGstDeducted",
  "refundCourierDeducted",
  "cancelReason",
  "createdAt",
  "updatedAt",
];

function sanitizeDateOnly(value) {
  if (value == null || value === "") return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function sanitizeTatDays(value) {
  if (value == null || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function buildDeliveryFields(deliverySnapshot) {
  return {
    estimatedDeliveryFrom: sanitizeDateOnly(
      deliverySnapshot?.estimatedDeliveryFrom,
    ),
    estimatedDeliveryTo: sanitizeDateOnly(deliverySnapshot?.estimatedDeliveryTo),
    tatDaysAtOrder: sanitizeTatDays(deliverySnapshot?.tatDays),
    deliveryEstimateLabel:
      deliverySnapshot?.deliveryEstimateLabel?.slice(0, 64) || null,
  };
}

async function fetchCompleteOrderForResponse(orderId) {
  const include = [
    {
      model: OrderItem,
      as: "orderItems",
      include: [
        {
          model: Product,
          as: "product",
          include: [
            {
              model: ProductImage,
              as: "images",
              attributes: ["imageUrl"],
            },
          ],
        },
      ],
    },
  ];

  try {
    return await Order.findByPk(orderId, {
      attributes: [...CORE_ORDER_RESPONSE_ATTRS, ...DELIVERY_ESTIMATE_ORDER_ATTRS],
      include,
    });
  } catch (err) {
    console.warn(
      "[createOrder] Full order fetch failed, retrying without delivery columns:",
      err.message,
    );
    return Order.findByPk(orderId, {
      attributes: CORE_ORDER_RESPONSE_ATTRS,
      include,
    });
  }
}

// Create a new order from the user's cart
async function createOrder(req, res) {
  const userId = req.user.userId;

  try {
    // Validate request body
    if (!req.body) {
      return res.status(400).json({ message: "Order details are mandatory." });
    }

    // Extract and validate order details
    const {
      firstName,
      lastName,
      mobileNumber,
      emailAddress,
      fullAddress,
      flatNumber,
      buildingName,
      townOrCity,
      country,
      state,
      pinCode,
      preferredPaymentMethod: preferredPaymentMethodRaw,
    } = req.body;

    const preferredPaymentMethod = normalizePreferredPaymentMethod(
      preferredPaymentMethodRaw,
    );

    // Comprehensive validation
    const validationErrors = [];

    if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
      validationErrors.push(
        "First Name is required and must be a non-empty string.",
      );
    }
    if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
      validationErrors.push(
        "Last Name is required and must be a non-empty string.",
      );
    }
    if (
      !buildingName ||
      typeof buildingName !== "string" ||
      !buildingName.trim()
    ) {
      validationErrors.push(
        "Building / House Name is required and must be a non-empty string.",
      );
    }
    if (flatNumber && (typeof flatNumber !== "string" || !flatNumber.trim())) {
      validationErrors.push(
        "Flat / Apartment No, if provided, must be a non-empty string.",
      );
    }
    if (!mobileNumber || !/^\d{10}$/.test(String(mobileNumber))) {
      validationErrors.push(
        "Mobile Number is required and must be exactly 10 digits.",
      );
    }
    if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
      validationErrors.push("Valid Email Address is required.");
    }
    if (
      !fullAddress ||
      typeof fullAddress !== "string" ||
      !fullAddress.trim()
    ) {
      validationErrors.push(
        "Full Address is required and must be a non-empty string.",
      );
    }
    if (!townOrCity || typeof townOrCity !== "string" || !townOrCity.trim()) {
      validationErrors.push(
        "Town or City is required and must be a non-empty string.",
      );
    }
    if (!country || typeof country !== "string" || !country.trim()) {
      validationErrors.push(
        "Country is required and must be a non-empty string.",
      );
    }
    if (!state || typeof state !== "string" || !state.trim()) {
      validationErrors.push(
        "State is required and must be a non-empty string.",
      );
    }
    if (!pinCode || !/^\d{6}$/.test(String(pinCode))) {
      validationErrors.push(
        "Pin Code is required and must be exactly 6 digits.",
      );
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Validation failed.",
        errors: validationErrors,
      });
    }

    await Order.update(
      {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: "payment_timeout",
        refundType: "none",
      },
      {
        where: {
          userId,
          status: "pending",
          createdAt: { [Op.lt]: getPendingOrderCutoffDate() },
        },
      },
    );

    const existingPending = await Order.findOne({
      where: pendingOrderWhere(userId),
      order: [["createdAt", "DESC"]],
      attributes: ["id", "createdAt", "preferredPaymentMethod"],
    });

    if (existingPending) {
      const existingMethod = normalizePreferredPaymentMethod(
        existingPending.preferredPaymentMethod,
      );

      // Payment method changed — cancel stale pending order and allow a fresh checkout.
      if (existingMethod !== preferredPaymentMethod) {
        await existingPending.update({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: "payment_method_changed",
          refundType: "none",
        });
      } else {
        return res.status(409).json({
          message:
            "You already have a pending order. Complete payment or cancel it before placing a new one.",
          existingOrderId: existingPending.id,
          resume: true,
          preferredPaymentMethod: existingPending.preferredPaymentMethod,
        });
      }
    }

    // Validate pincode for Indian addresses
    if (country.toLowerCase() === "india") {
      const validatePinCode = commonUtils.isValidIndianPincode(pinCode);
      if (!validatePinCode) {
        return res
          .status(400)
          .json({ message: "Invalid Indian pin code format." });
      }

      const isRealPinCode = commonUtils.isRealPincode(pinCode);
      if (!isRealPinCode) {
        return res
          .status(400)
          .json({ message: "Pin code does not exist in India." });
      }
    }

    // Get user's cart with products
    const cart = await Cart.findOne({
      where: { userId },
      include: [
        {
          model: Product,
          as: "products",
          through: {
            model: CartItem,
            as: "cartItem",
            attributes: ["quantity", "selectedModelId"],
          },
          include: [
            {
              model: ProductImage,
              as: "images",
              attributes: ["imageUrl"],
              limit: 1,
            },
          ],
        },
      ],
    });

    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(400).json({
        message:
          "Cart is empty. Add products to your cart before placing an order.",
      });
    }

    // Validate products are still available
    const unavailableProducts = [];
    let totalAmount = 0;

    // Get all cartItems to check for deleted products
    const cartItems = await CartItem.findAll({
      where: { cartId: cart.id },
      attributes: ["productId"],
    });
    const existingProductIds = cart.products
      .filter((p) => p !== null)
      .map((p) => p.id);
    const deletedProductIds = cartItems
      .map((item) => item.productId)
      .filter((id) => !existingProductIds.includes(id));

    deletedProductIds.forEach((productId) => {
      unavailableProducts.push({ id: productId, name: "Product not found" });
    });

    const lineTotals = await Promise.all(
      cart.products.map(async (product) => {
        if (!product?.cartItem) return 0;
        const unit = await resolveCartLineUnitPrice(
          product,
          product.cartItem.selectedModelId,
        );
        return unit * product.cartItem.quantity;
      }),
    );
    totalAmount = lineTotals.reduce((a, b) => a + b, 0);

    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        message: "Some products in your cart are no longer available.",
        unavailableProducts,
      });
    }

    // UPI repeat-purchase discount (2nd order 10%, 3rd order 20%, UPI only)
    const purchaseCount = await getPaidOrderCount(userId);
    const nextOrderNumber = purchaseCount + 1;
    const discountPercent = getUpiDiscountPercent(
      nextOrderNumber,
      preferredPaymentMethod,
    );
    const discountAmount = (totalAmount * discountPercent) / 100;
    const finalTotalAmount =
      Math.round((totalAmount - discountAmount) * 100) / 100;

    if (preferredPaymentMethod === "COD") {
      const codCheck = await validateCodEligibility({
        pinCode,
        totalAmount: finalTotalAmount,
      });
      if (!codCheck.eligible) {
        return res.status(400).json({
          message: codCheck.error || "Cash on Delivery is not available.",
        });
      }
    }

    let deliverySnapshot = null;
    try {
      deliverySnapshot = await getDeliveryEstimate({
        destPin: String(pinCode),
        paymentMode:
          preferredPaymentMethod === "COD" ? "COD" : "PREPAID",
        allowFallback: true,
      });
    } catch (estimateErr) {
      console.error("[createOrder] Delivery estimate failed:", estimateErr.message);
    }

    // Create order
    const orderBase = {
      userId,
      totalAmount: finalTotalAmount.toFixed(2),
      subtotal: totalAmount.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      upiDiscountPercent: discountPercent,
      preferredPaymentMethod,
      paymentMode: preferredPaymentMethod === "COD" ? "COD" : null,
      orderNumberForUser: nextOrderNumber,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      mobileNumber: parseInt(mobileNumber),
      emailAddress: emailAddress.trim(),
      flatNumber: flatNumber ? flatNumber.trim() : null,
      buildingName: buildingName.trim(),
      fullAddress: fullAddress.trim(),
      townOrCity: townOrCity.trim(),
      country: country.trim(),
      state: state.trim(),
      pinCode: parseInt(pinCode),
      status: "pending",
    };

    const deliveryFields = buildDeliveryFields(deliverySnapshot);

    let order;
    try {
      await sequelize.transaction(async (transaction) => {
        try {
          order = await Order.create(
            { ...orderBase, ...deliveryFields },
            { transaction },
          );
        } catch (createErr) {
          const msg = String(createErr?.message || "");
          const sqlMsg = String(
            createErr?.parent?.sqlMessage || createErr?.parent?.message || "",
          );
          const combined = `${msg} ${sqlMsg}`;
          const missingOptionalCols =
            combined.includes("estimated_delivery") ||
            combined.includes("tat_days_at_order") ||
            combined.includes("delivery_estimate_label");
          if (!missingOptionalCols) throw createErr;
          console.warn(
            "[createOrder] Delivery estimate columns missing — run npm run migrate:delivery-estimate",
          );
          order = await Order.create(orderBase, { transaction });
        }

        const orderItems = await Promise.all(
          cart.products.map(async (product) => {
            const selectedModelId = product.cartItem.selectedModelId || null;

            let priceAtPurchase = product.discountPrice
              ? parseFloat(product.discountPrice)
              : parseFloat(product.price);

            let selectedModelName = null;

            if (selectedModelId) {
              const availableModel = await ProductAvailableModels.findOne({
                where: { productId: product.id, modelId: selectedModelId },
                include: [{ model: MobileModels, as: "model" }],
              });
              if (
                availableModel != null &&
                availableModel.priceOverride != null &&
                availableModel.priceOverride !== ""
              ) {
                priceAtPurchase = parseFloat(availableModel.priceOverride);
              }
              selectedModelName = availableModel?.model?.name || null;
            }

            return {
              orderId: order.id,
              productId: product.id,
              quantity: product.cartItem.quantity,
              priceAtPurchase,
              selectedModelId,
              selectedModelName,
            };
          }),
        );

        await OrderItem.bulkCreate(orderItems, { transaction });

        const itemsWithProduct = await OrderItem.findAll({
          where: { orderId: order.id },
          include: [{ model: Product, as: "product", attributes: ["sku"] }],
          transaction,
        });
        const firstSku = itemsWithProduct[0]?.product?.sku ?? null;
        const orderNumber = buildOrderNumber(order.id, order.createdAt, firstSku);
        await order.update({ orderNumber }, { transaction });
      });
    } catch (createTxnErr) {
      throw createTxnErr;
    }

    // Cart is cleared only after payment/COD confirmation (see orderFulfillmentService).

    // Fetch complete order with items for response
    const completeOrder = await fetchCompleteOrderForResponse(order.id);

    res.status(201).json({
      message:
        preferredPaymentMethod === "COD"
          ? "Order created. Confirm Cash on Delivery to place your order."
          : "Order created successfully. Proceed to payment.",
      order: completeOrder,
      nextStep: preferredPaymentMethod === "COD" ? "confirm_cod" : "payment",
      pendingOrderTtlMinutes: getPendingOrderTtlMinutes(),
      deliveryEstimate: deliverySnapshot
        ? {
            label: deliverySnapshot.deliveryEstimateLabel,
            from: deliverySnapshot.estimatedDeliveryFrom,
            to: deliverySnapshot.estimatedDeliveryTo,
            tatDays: deliverySnapshot.tatDays,
            serviceable: deliverySnapshot.serviceable,
          }
        : null,
    });
  } catch (error) {
    console.error("Error creating order:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        message: "Validation error.",
        errors: error.errors.map((e) => e.message),
      });
    }

    const detail =
      error?.parent?.sqlMessage ||
      error?.parent?.message ||
      error?.message ||
      "Unknown error";

    res.status(500).json({
      message: detail,
      error: detail,
    });
  }
}

async function getMyOrders(req, res) {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const where = { userId };

    const validStatuses = [
      "pending",
      "paid",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (status && validStatuses.includes(status)) {
      // Respect explicit status filter if it is valid
      where.status = status;
    }
    // else {

    //   where.status = "paid";
    // }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      attributes: [
        "id",
        "userId",
        "totalAmount",
        "subtotal",
        "discountAmount",
        "upiDiscountPercent",
        "preferredPaymentMethod",
        "orderNumberForUser",
        "orderNumber",
        "firstName",
        "lastName",
        "mobileNumber",
        "emailAddress",
        "flatNumber",
        "buildingName",
        "fullAddress",
        "townOrCity",
        "country",
        "state",
        "pinCode",
        "status",
        "payuTxnId",
        "payuPaymentId",
        "paymentMode",
        "bankRefNo",
        "payuStatus",
        "payuError",
        "shipmentId",
        "awbCode",
        "shipmentStatus",
        "shippingLabelUrl",
        ...DELIVERY_ESTIMATE_ORDER_ATTRS,
        "createdAt",
        "updatedAt",
        "cancelledAt",
        "refundType",
        "refundAmount",
        "refundGstDeducted",
        "refundCourierDeducted",
        "cancelReason",
      ],
      include: [
        {
          model: OrderItem,
          as: "orderItems",
          include: [
            {
              model: Product,
              as: "product",
              include: [
                {
                  model: ProductImage,
                  as: "images",
                  attributes: ["imageUrl"],
                  limit: 1,
                },
              ],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: offset,
    });

    res.status(200).json({
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit),
      },
      orders,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch orders.", error: error.message });
  }
}

// Get a specific order
async function getOrderById(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ message: "Invalid or missing order id." });
    }

    const owned = await Order.findOne({
      where: { id, userId },
      attributes: ["id"],
    });

    if (!owned) {
      return res
        .status(404)
        .json({ message: "Order not found or does not belong to you." });
    }

    const order = await fetchCompleteOrderForResponse(id);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    // Calculate order summary
    const orderSummary = {
      totalItems: order.orderItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      totalAmount: parseFloat(order.totalAmount),
      status: order.status,
      orderDate: order.createdAt,
      shippingAddress: {
        firstName: order.firstName,
        lastName: order.lastName,
        flatNumber: order.flatNumber,
        buildingName: order.buildingName,
        fullAddress: order.fullAddress,
        townOrCity: order.townOrCity,
        state: order.state,
        country: order.country,
        pinCode: order.pinCode,
        mobileNumber: order.mobileNumber,
        emailAddress: order.emailAddress,
      },
    };

    res.status(200).json({
      order: {
        ...order.toJSON(),
        summary: orderSummary,
      },
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch order.", error: error.message });
  }
}

// Cancel an order (only if pending)
async function cancelOrder(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ message: "Invalid or missing order id." });
    }

    const order = await Order.findOne({ where: { id, userId } });

    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found or does not belong to you." });
    }

    // ── Evaluate policy — all business rules in one call ──────────────────
    const policy = evaluateCancellationPolicy(order);

    if (!policy.canCancel) {
      return res.status(400).json({
        message: policy.reason,
        orderStatus: order.status,
        shipmentStatus: order.shipmentStatus,
      });
    }

    // ── Rule 3: compute partial refund suggestion ──────────────────────────
    const effectiveRefundType = getEffectiveRefundType(order, policy.refundType);
    const refund =
      effectiveRefundType === "partial"
        ? calculatePartialRefund(order.totalAmount)
        : null;

    // ── Rule 2: call Delhivery to void the AWB ────────────────────────────
    let delhiveryCancelled = false;
    let delhiveryError = null;

    if (policy.isDelhiveryCancellable && getDelhiveryConfig().isConfigured) {
      try {
        const result = await cancelShipment(order.awbCode);
        delhiveryCancelled = result.success;
        if (!result.success) {
          // Log for ops team — do NOT block customer cancellation
          delhiveryError = result.error;
          console.error(
            "[cancelOrder] Delhivery cancel API failed — manual action required",
            {
              orderId: order.id,
              awb: order.awbCode,
              error: result.error,
            },
          );
        }
      } catch (err) {
        delhiveryError = err.message;
        console.error("[cancelOrder] Delhivery cancel threw exception", {
          orderId: order.id,
          awb: order.awbCode,
          error: err.message,
        });
      }
    }

    // ── Persist cancellation to DB ─────────────────────────────────────────
    const updatePayload = {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelReason: getCancelReasonCode(policy.rule),
      refundType: effectiveRefundType,
      shipmentStatus: order.awbCode ? "cancelled" : order.shipmentStatus,
      ...(refund && {
        refundAmount: refund.refundAmount,
        refundGstDeducted: refund.gstDeducted,
        refundCourierDeducted: refund.courierDeducted,
      }),
    };

    await order.update(updatePayload);

    // ── Send emails non-blocking ───────────────────────────────────────────
    setImmediate(async () => {
      try {
        const plainOrder =
          typeof order.toJSON === "function" ? order.toJSON() : { ...order };
        await sendCancellationEmails(
          plainOrder,
          { ...policy, refundType: effectiveRefundType },
          refund,
        );
      } catch (err) {
        console.error("[cancelOrder] Email send failed:", err.message);
      }
    });

    // ── Response ───────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully.",
      cancellation: {
        orderId: order.id,
        orderRef: order.orderNumber || `#${order.id}`,
        rule: policy.rule,
        refundType: effectiveRefundType,
        ...(refund && effectiveRefundType !== "none" && {
          estimatedRefund: refund.refundAmount,
          deductions: {
            gst: refund.gstDeducted,
            courier: refund.courierDeducted,
            total: refund.totalDeducted,
          },
          note: "Final refund amount subject to admin review within 2 business days.",
        }),
        ...(policy.rule === "2" && {
          delhiveryCancelled,
          ...(delhiveryError && {
            adminNote:
              "Delhivery AWB cancellation API failed — please cancel manually in Delhivery panel.",
          }),
        }),
      },
    });
  } catch (error) {
    console.error("[cancelOrder] Error:", error);
    res
      .status(500)
      .json({ message: "Failed to cancel order.", error: error.message });
  }
}

async function confirmCodOrder(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({ message: "Invalid or missing order id." });
    }

    const order = await Order.findOne({ where: { id, userId } });
    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found or does not belong to you." });
    }

    if (order.status === "processing" || order.status === "paid") {
      return res.status(200).json({
        success: true,
        message: "Order is already confirmed.",
        orderId: order.id,
        alreadyConfirmed: true,
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        message: `Order cannot be confirmed in status "${order.status}".`,
      });
    }

    if (isPendingOrderExpired(order)) {
      return res.status(410).json({
        message:
          "This order has expired. Please place a new order from your cart.",
        expired: true,
      });
    }

    const method = normalizePreferredPaymentMethod(order.preferredPaymentMethod);
    if (method !== "COD" && !isCodOrder(order)) {
      return res.status(400).json({
        message: "This order is not a Cash on Delivery order.",
      });
    }

    const codCheck = await validateCodEligibility({
      pinCode: order.pinCode,
      totalAmount: order.totalAmount,
    });
    if (!codCheck.eligible) {
      return res.status(400).json({
        message: codCheck.error || "Cash on Delivery is not available.",
      });
    }

    const statusUpdated = await safeStatusUpdate(order, "processing", {
      preferredPaymentMethod: "COD",
      paymentMode: "COD",
    });

    if (!statusUpdated) {
      const refreshed = await Order.findByPk(order.id);
      if (
        refreshed &&
        (refreshed.status === "processing" || refreshed.status === "paid")
      ) {
        return res.status(200).json({
          success: true,
          message: "Order is already confirmed.",
          orderId: refreshed.id,
          alreadyConfirmed: true,
        });
      }
      return res.status(409).json({
        message: "Could not confirm order. Please try again.",
      });
    }

    setImmediate(() => {
      fulfillOrder(order.id).catch((err) =>
        console.error("[confirmCodOrder] Fulfillment failed:", err.message),
      );
    });

    return res.status(200).json({
      success: true,
      message: "Order placed successfully with Cash on Delivery.",
      orderId: order.id,
      paymentMethod: "COD",
    });
  } catch (error) {
    console.error("[confirmCodOrder] Error:", error);
    res.status(500).json({
      message: "Failed to confirm Cash on Delivery order.",
      error: error.message,
    });
  }
}

async function resumePayment(req, res) {
  try {
    const { id } = req.params;
    const { preferredPaymentMethod: methodRaw } = req.body || {};
    const userId = req.user.userId;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({ message: "Invalid or missing order id." });
    }

    const order = await Order.findOne({ where: { id, userId } });
    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found or does not belong to you." });
    }

    if (isCodOrder(order)) {
      return res.status(400).json({
        message:
          "This is a Cash on Delivery order. Use confirm COD instead of online payment.",
      });
    }

    if (order.status === "paid") {
      return res.status(400).json({ message: "Order is already paid." });
    }

    if (isPendingOrderExpired(order)) {
      return res.status(410).json({
        message:
          "This order has expired. Please place a new order from your cart.",
        expired: true,
      });
    }

    if (methodRaw) {
      const nextMethod = normalizePreferredPaymentMethod(methodRaw);
      if (nextMethod === "COD") {
        return res.status(400).json({
          message:
            "Cannot resume online payment as Cash on Delivery. Place a new COD order instead.",
        });
      }
      if (nextMethod !== normalizePreferredPaymentMethod(order.preferredPaymentMethod)) {
        const subtotal = parseFloat(order.subtotal || order.totalAmount);
        const discountPercent = getUpiDiscountPercent(
          order.orderNumberForUser,
          nextMethod,
        );
        const discountAmount = (subtotal * discountPercent) / 100;
        const finalTotalAmount =
          Math.round((subtotal - discountAmount) * 100) / 100;

        await order.update({
          preferredPaymentMethod: nextMethod,
          discountAmount: discountAmount.toFixed(2),
          upiDiscountPercent: discountPercent,
          totalAmount: finalTotalAmount.toFixed(2),
        });
        order.preferredPaymentMethod = nextMethod;
        order.totalAmount = finalTotalAmount.toFixed(2);
        order.discountAmount = discountAmount.toFixed(2);
        order.upiDiscountPercent = discountPercent;
      }
    }

    const result = await buildPayuPaymentForOrder(order);

    return res.status(200).json({
      message: "Payment resumed successfully.",
      orderId: result.orderId,
      paymentFormHtml: result.paymentFormHtml,
    });
  } catch (error) {
    console.error("[resumePayment] Error:", error);
    res.status(400).json({
      message: error.message || "Failed to resume payment.",
    });
  }
}

async function restoreCartFromOrder(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({ message: "Invalid or missing order id." });
    }

    const order = await Order.findOne({
      where: { id, userId },
      include: [{ model: OrderItem, as: "orderItems" }],
    });

    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found or does not belong to you." });
    }

    const restorable =
      order.status === "pending" ||
      (order.status === "cancelled" &&
        order.cancelReason === "payment_timeout");

    if (!restorable) {
      return res.status(400).json({
        message:
          "Cart can only be restored from unpaid or expired pending orders.",
      });
    }

    if (!order.orderItems || order.orderItems.length === 0) {
      return res.status(400).json({
        message: "This order has no items to restore.",
      });
    }

    const cart = await Cart.findOne({ where: { userId } });
    if (cart) {
      const existingCount = await CartItem.count({ where: { cartId: cart.id } });
      if (existingCount > 0) {
        return res.status(200).json({
          success: true,
          message: "Your cart already has items — no restore needed.",
          alreadyInCart: true,
          restoredCount: 0,
          skippedCount: 0,
        });
      }
    }

    const { restored, skipped } = await restoreCartItemsForUser(
      userId,
      order.orderItems,
    );

    return res.status(200).json({
      success: true,
      message: `Restored ${restored.length} item(s) to your cart.`,
      restoredCount: restored.length,
      skippedCount: skipped.length,
      skipped,
    });
  } catch (error) {
    console.error("[restoreCartFromOrder] Error:", error);
    res.status(500).json({
      message: "Failed to restore cart from order.",
      error: error.message,
    });
  }
}

async function trackOrderStatus(req, res) {
  const userId = req.user?.userId;
  const { orderId } = req.params;

  try {
    if (!orderId) {
      return res.status(400).json({ message: "Invalid or missing order ID." });
    }

    const order = await Order.findOne({ where: { id: orderId, userId } });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    // ── Pull live tracking from Delhivery ──────────────────────────────────
    let trackingResult = null;
    if (getDelhiveryConfig().isConfigured && order.awbCode) {
      trackingResult = await delhiveryTrack(order.awbCode);
    }

    // ── Resolve stage ──────────────────────────────────────────────────────
    const rawStatus = trackingResult?.success
      ? trackingResult.status
      : order.shipmentStatus;
    const stage = resolveDeliveryStage(rawStatus, order);
    const timeline = buildStageTimeline(stage.code);

    // ── Sync order status in DB if changed ────────────────────────────────
    if (trackingResult?.success) {
      const patch = {};
      const wasDelivered =
        stage.code === "delivered" && order.shipmentStatus !== "delivered";

      if (rawStatus && rawStatus !== order.shipmentStatus) {
        patch.shipmentStatus = rawStatus;
      }

      if (wasDelivered) {
        patch.status = "delivered";
        if (Object.keys(patch).length) await order.update(patch);

        try {
          await createReviewRemindersForDeliveredOrder({
            orderId: order.id,
            deliveredAt: new Date(),
          });
        } catch (e) {
          console.error("[ReviewReminder] Failed:", e.message);
        }
      } else {
        // Only sync shipmentStatus — never overwrite order.status automatically
        // Admin manual status changes must never be overwritten by tracking sync
        if (Object.keys(patch).length) {
          await order.update(patch); // patch only has shipmentStatus here
        }
        // Safely attempt shipped transition — skipped if already delivered/cancelled
        await safeStatusUpdate(order, "shipped");
      }

      await order.reload();
    }

    const cancellationPolicy = evaluateCancellationPolicy(order);

    // ── Cancellation window info (for frontend "cancel" button logic) ──────
    const windowRemaining =
      order.status !== "cancelled" && order.status !== "delivered"
        ? getCancellationWindowRemaining(order.createdAt)
        : null;

    return res.status(200).json({
      success: true,
      orderId: order.id,
      orderStatus: order.status,
      awb: order.awbCode || null,

      // Current stage (rich object)
      stage: {
        code: stage.code,
        label: stage.label,
        description: stage.description,
        step: stage.step,
        // Frontend should follow the same business rules as `cancelOrder`.
        isCancellable: cancellationPolicy.canCancel,
        refundType: cancellationPolicy.refundType,
        cancelRule: cancellationPolicy.rule,
      },

      // Full timeline for progress bar
      timeline,

      // Delhivery raw data (for detailed scan history)
      scans: trackingResult?.scans || [],
      statusCode: trackingResult?.statusCode || null,
      statusLocation: trackingResult?.statusLocation || null,
      statusDateTime: trackingResult?.statusDateTime || null,
      tracking: trackingResult?.raw || null,

      // Cancellation window (use on frontend to show/hide cancel button)
      cancellationWindow: windowRemaining,
    });
  } catch (err) {
    console.error("[trackOrderStatus] Error:", err.message);
    res
      .status(500)
      .json({ message: "Failed to fetch tracking.", error: err.message });
  }
}


async function getOrderInvoicePdf(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ message: "Invalid or missing order id." });
    }

    const order = await Order.findOne({
      where: { id, userId },
      attributes: [
        "id",
        "userId",
        "totalAmount",
        "subtotal",
        "discountAmount",
        "upiDiscountPercent",
        "preferredPaymentMethod",
        "orderNumberForUser",
        "orderNumber",
        "firstName",
        "lastName",
        "mobileNumber",
        "emailAddress",
        "flatNumber",
        "buildingName",
        "fullAddress",
        "townOrCity",
        "country",
        "state",
        "pinCode",
        "awbCode",
        "status",
        "payuTxnId",
        "payuPaymentId",
        "paymentMode",
        "bankRefNo",
        "payuStatus",
        "payuError",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: OrderItem,
          as: "orderItems",
          include: [
            {
              model: Product,
              as: "product",
              attributes: ["sku", "title"],
            },
          ],
        },
      ],
    });

    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found or does not belong to you." });
    }

    const plainOrder =
      typeof order.toJSON === "function" ? order.toJSON() : order;
    const pdfBuffer = await createInvoicePdf(plainOrder, plainOrder.orderItems);

    // const displayId = plainOrder.orderNumber || plainOrder.id;
    const firstSku = plainOrder.orderItems?.[0]?.product?.sku ?? null;
    const displayId =
      plainOrder.orderNumber ||
      (plainOrder.id != null && plainOrder.createdAt
        ? buildOrderNumber(plainOrder.id, plainOrder.createdAt, firstSku)
        : plainOrder.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoice-${displayId}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    return res.status(500).json({
      message: "Failed to generate invoice PDF.",
      error: error.message,
    });
  }
}

// Get shipping label URL for an order (user must own the order). Used when order has AWB but no stored label URL.
async function getOrderShippingLabel(req, res) {
  const userId = req.user?.userId;
  const { id } = req.params;

  try {
    if (!id) {
      return res.status(400).json({ message: "Invalid or missing order ID." });
    }

    const order = await Order.findOne({
      where: { id, userId },
      attributes: ["id", "awbCode"],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (!order.awbCode) {
      return res
        .status(400)
        .json({ message: "No shipment AWB for this order." });
    }

    if (!getDelhiveryConfig().isConfigured) {
      return res
        .status(503)
        .json({ message: "Shipping label service not configured." });
    }

    return res.status(200).json({
      success: true,
      message: "Use backend label download endpoint",
      downloadUrl: `/api/orders/${order.id}/shipping-label/download`,
    });
  } catch (err) {
    console.error("getOrderShippingLabel error:", err.message);
    return res.status(500).json({
      message: "Failed to get shipping label.",
      error: err.message,
    });
  }
}

async function downloadOrderShippingLabel(req, res) {
  const userId = req.user?.userId;
  const { id } = req.params;

  try {
    if (!id) {
      return res.status(400).json({ message: "Invalid or missing order ID." });
    }

    const order = await Order.findOne({
      where: { id, userId },
      attributes: ["id", "awbCode"],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (!order.awbCode) {
      return res
        .status(400)
        .json({ message: "No shipment AWB for this order." });
    }

    if (!getDelhiveryConfig().isConfigured) {
      return res
        .status(503)
        .json({ message: "Shipping label service not configured." });
    }

    const result = await delhiveryGetLabel(order.awbCode);

    if (!result.success) {
      return res.status(502).json({
        message: result.error || "Failed to fetch shipping label.",
      });
    }

    return res.status(200).json({
      success: true,
      awb: order.awbCode,
      labelData: result.labelData,
    });
  } catch (err) {
    console.error("downloadOrderShippingLabel error:", err.message);
    return res.status(500).json({
      message: "Failed to download shipping label.",
      error: err.message,
    });
  }
}

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  confirmCodOrder,
  resumePayment,
  restoreCartFromOrder,
  trackOrderStatus,
  getOrderInvoicePdf,
  getOrderShippingLabel,
  downloadOrderShippingLabel,
};
