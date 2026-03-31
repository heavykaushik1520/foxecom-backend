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
const { getShiprocketToken } = require("../utils/getShiprocketToken");
const {
  trackShipment: delhiveryTrack,
  getDelhiveryConfig,
  getLabel: delhiveryGetLabel,
} = require("../services/delhivery/delhiveryApi");
const { createInvoicePdf } = require("../utils/invoiceGenerator");
const { buildOrderNumber } = require("../utils/orderNumberHelper");
const {
  createReviewRemindersForDeliveredOrder,
} = require("../services/reviewReminderService");

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
        "firstName",
        "lastName",
        "mobileNumber",
        "emailAddress",
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
        "createdAt",
        "updatedAt",
      ],
    });

    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found or does not belong to you." });
    }

    // Only allow cancellation of pending orders
    if (order.status !== "pending") {
      return res.status(400).json({
        message: `Cannot cancel order with status: ${order.status}. Only pending orders can be cancelled.`,
      });
    }

    // Update order status to cancelled
    await order.update({ status: "cancelled" });

    res.status(200).json({
      message: "Order cancelled successfully.",
      order: {
        id: order.id,
        status: order.status,
        cancelledAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res
      .status(500)
      .json({ message: "Failed to cancel order.", error: error.message });
  }
}

//created on 12-06
async function trackOrderStatus(req, res) {
  const userId = req.user?.userId;
  const { orderId } = req.params;

  try {
    if (!orderId) {
      return res.status(400).json({ message: "Invalid or missing order ID." });
    }

    const order = await Order.findOne({
      where: { id: orderId, userId },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const awb = order.awbCode;

    if (getDelhiveryConfig().isConfigured && awb) {
      const result = await delhiveryTrack(awb);

      if (result.success) {
        const patch = {};

        const wasDeliveredTransition =
          result.status === "delivered" && order.shipmentStatus !== "delivered";

        if (result.status && result.status !== order.shipmentStatus) {
          patch.shipmentStatus = result.status;
        }

        if (wasDeliveredTransition) {
          patch.status = "delivered";

          if (Object.keys(patch).length) {
            await order.update(patch);
          }

          try {
            await createReviewRemindersForDeliveredOrder({
              orderId: order.id,
              deliveredAt: new Date(),
            });
            console.log(
              "[ReviewReminder] Created reminders for order",
              order.id,
            );
          } catch (e) {
            console.error(
              "[ReviewReminder] Failed to create reminders",
              e.message,
            );
          }

          // ✅ Response return করো
          return res.status(200).json({
            message: "Tracking fetched successfully.",
            orderId: order.id,
            orderStatus: "delivered",
            shipmentStatus: result.status,
            awb,
            tracking: result.raw,
            scans: result.scans,
            statusCode: result.statusCode,
            statusLocation: result.statusLocation,
            statusDateTime: result.statusDateTime,
          });
        } else if (
          [
            "manifested",
            "picked_up",
            "in_transit",
            "out_for_delivery",
          ].includes(result.status) &&
          order.shipmentStatus !== "delivered" &&
          !["cancelled"].includes(order.status)
        ) {
          patch.status = "shipped";
        }

        if (Object.keys(patch).length) {
          await order.update(patch);
        }

        return res.status(200).json({
          message: "Tracking fetched successfully.",
          orderId: order.id,
          orderStatus: patch.status || order.status,
          shipmentStatus: result.status,
          awb,
          tracking: result.raw,
          scans: result.scans,
          statusCode: result.statusCode,
          statusLocation: result.statusLocation,
          statusDateTime: result.statusDateTime,
        });
      }
    }

    return res.status(200).json({
      message: order.awbCode
        ? "Tracking not available yet. Please check back later."
        : "Shipment not yet created for this order.",
      orderId: order.id,
      status: order.status,
      shipmentStatus: order.shipmentStatus,
      tracking: null,
    });
  } catch (err) {
    console.error("Tracking error:", err.message);
    res.status(500).json({
      message: "Failed to fetch tracking information.",
      error: err.message,
    });
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
