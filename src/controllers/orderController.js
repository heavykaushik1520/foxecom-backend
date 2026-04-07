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
} = require("../models");
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

    const preferredPaymentMethod = String(
      preferredPaymentMethodRaw || "OTHER",
    ).toUpperCase();

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
            attributes: ["quantity"],
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

    // Calculate total for available products using discountPrice if available, otherwise price
    for (const product of cart.products) {
      if (product && product.cartItem) {
        const productPrice = product.discountPrice
          ? parseFloat(product.discountPrice)
          : parseFloat(product.price);
        totalAmount += productPrice * product.cartItem.quantity;
      }
    }

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

    // Create order
    const order = await Order.create({
      userId,
      totalAmount: finalTotalAmount.toFixed(2),
      subtotal: totalAmount.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      upiDiscountPercent: discountPercent,
      preferredPaymentMethod:
        preferredPaymentMethod === "UPI" ? "UPI" : "OTHER",
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
    });

    // Create order items - store discountPrice if available, otherwise price
    const orderItems = cart.products.map((product) => {
      const productPrice = product.discountPrice
        ? parseFloat(product.discountPrice)
        : parseFloat(product.price);
      return {
        orderId: order.id,
        productId: product.id,
        quantity: product.cartItem.quantity,
        priceAtPurchase: productPrice,
      };
    });

    await OrderItem.bulkCreate(orderItems);

    // Set display order number: SKU_LAST4/DDMMYYYY/id (e.g. 1663/14032026/50)
    const itemsWithProduct = await OrderItem.findAll({
      where: { orderId: order.id },
      include: [{ model: Product, as: "product", attributes: ["sku"] }],
    });
    const firstSku = itemsWithProduct[0]?.product?.sku ?? null;
    const orderNumber = buildOrderNumber(order.id, order.createdAt, firstSku);
    await order.update({ orderNumber });

    // Clear cart after successful order creation
    await CartItem.destroy({ where: { cartId: cart.id } });

    // Fetch complete order with items for response
    // Explicitly select only existing columns to avoid database errors
    const completeOrder = await Order.findByPk(order.id, {
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
      ],
    });

    res.status(201).json({
      message: "Order created successfully. Proceed to payment.",
      order: completeOrder,
      nextStep: "payment",
    });
  } catch (error) {
    console.error("Error creating order:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        message: "Validation error.",
        errors: error.errors.map((e) => e.message),
      });
    }

    res.status(500).json({
      message: "Failed to create order.",
      error: error.message,
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
                },
              ],
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
    const refund =
      policy.refundType === "partial"
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
      refundType: policy.refundType,
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
        await sendCancellationEmails(plainOrder, policy, refund);
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
        refundType: policy.refundType,
        ...(refund && {
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
  trackOrderStatus,
  getOrderInvoicePdf,
  getOrderShippingLabel,
  downloadOrderShippingLabel,
};
