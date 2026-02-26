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
const { getShiprocketToken } = require("../utils/getShiprocketToken");
const { trackShipment: delhiveryTrack, getDelhiveryConfig } = require("../services/delhivery/delhiveryApi");

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
      townOrCity,
      country,
      state,
      pinCode,
    } = req.body;

    // Comprehensive validation
    const validationErrors = [];
    
    if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
      validationErrors.push("First Name is required and must be a non-empty string.");
    }
    if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
      validationErrors.push("Last Name is required and must be a non-empty string.");
    }
    if (!mobileNumber || !/^\d{10}$/.test(String(mobileNumber))) {
      validationErrors.push("Mobile Number is required and must be exactly 10 digits.");
    }
    if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
      validationErrors.push("Valid Email Address is required.");
    }
    if (!fullAddress || typeof fullAddress !== "string" || !fullAddress.trim()) {
      validationErrors.push("Full Address is required and must be a non-empty string.");
    }
    if (!townOrCity || typeof townOrCity !== "string" || !townOrCity.trim()) {
      validationErrors.push("Town or City is required and must be a non-empty string.");
    }
    if (!country || typeof country !== "string" || !country.trim()) {
      validationErrors.push("Country is required and must be a non-empty string.");
    }
    if (!state || typeof state !== "string" || !state.trim()) {
      validationErrors.push("State is required and must be a non-empty string.");
    }
    if (!pinCode || !/^\d{6}$/.test(String(pinCode))) {
      validationErrors.push("Pin Code is required and must be exactly 6 digits.");
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: "Validation failed.", 
        errors: validationErrors 
      });
    }

    // Validate pincode for Indian addresses
    if (country.toLowerCase() === 'india') {
      const validatePinCode = commonUtils.isValidIndianPincode(pinCode);
      if (!validatePinCode) {
        return res.status(400).json({ message: "Invalid Indian pin code format." });
      }
      
      const isRealPinCode = commonUtils.isRealPincode(pinCode);
      if (!isRealPinCode) {
        return res.status(400).json({ message: "Pin code does not exist in India." });
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
        message: "Cart is empty. Add products to your cart before placing an order." 
      });
    }

    // Validate products are still available
    const unavailableProducts = [];
    let totalAmount = 0;

    // Get all cartItems to check for deleted products
    const cartItems = await CartItem.findAll({ 
      where: { cartId: cart.id },
      attributes: ['productId']
    });
    const existingProductIds = cart.products
      .filter(p => p !== null)
      .map(p => p.id);
    const deletedProductIds = cartItems
      .map(item => item.productId)
      .filter(id => !existingProductIds.includes(id));
    
    deletedProductIds.forEach(productId => {
      unavailableProducts.push({ id: productId, name: "Product not found" });
    });

    // Calculate total for available products using discountPrice if available, otherwise price
    for (const product of cart.products) {
      if (product && product.cartItem) {
        const productPrice = product.discountPrice ? parseFloat(product.discountPrice) : parseFloat(product.price);
        totalAmount += productPrice * product.cartItem.quantity;
      }
    }

    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        message: "Some products in your cart are no longer available.",
        unavailableProducts
      });
    }

    // Create order
    const order = await Order.create({
      userId,
      totalAmount: totalAmount.toFixed(2),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      mobileNumber: parseInt(mobileNumber),
      emailAddress: emailAddress.trim(),
      fullAddress: fullAddress.trim(),
      townOrCity: townOrCity.trim(),
      country: country.trim(),
      state: state.trim(),
      pinCode: parseInt(pinCode),
      status: 'pending'
    });

    // Create order items - store discountPrice if available, otherwise price
    const orderItems = cart.products.map((product) => {
      const productPrice = product.discountPrice ? parseFloat(product.discountPrice) : parseFloat(product.price);
      return {
        orderId: order.id,
        productId: product.id,
        quantity: product.cartItem.quantity,
        priceAtPurchase: productPrice,
      };
    });

    await OrderItem.bulkCreate(orderItems);

    // Clear cart after successful order creation
    await CartItem.destroy({ where: { cartId: cart.id } });

    // Fetch complete order with items for response
    // Explicitly select only existing columns to avoid database errors
    const completeOrder = await Order.findByPk(order.id, {
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'shipmentId', 'awbCode', 'shipmentStatus', 'shippingLabelUrl',
        'createdAt', 'updatedAt'
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
      nextStep: "payment"
    });

  } catch (error) {
    console.error('Error creating order:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        message: "Validation error.", 
        errors: error.errors.map(e => e.message) 
      });
    }
    
    res.status(500).json({ 
      message: "Failed to create order.", 
      error: error.message 
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
    if (status && ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      where.status = status;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'shipmentId', 'awbCode', 'shipmentStatus', 'shippingLabelUrl',
        'createdAt', 'updatedAt'
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
        itemsPerPage: parseInt(limit)
      },
      orders
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
      return res
        .status(400)
        .json({ message: "Invalid or missing order id." });
    }

    const order = await Order.findOne({
      where: { id, userId },
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'shipmentId', 'awbCode', 'shipmentStatus', 'shippingLabelUrl',
        'createdAt', 'updatedAt'
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
      return res.status(404).json({ message: "Order not found or does not belong to you." });
    }

    // Calculate order summary
    const orderSummary = {
      totalItems: order.orderItems.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: parseFloat(order.totalAmount),
      status: order.status,
      orderDate: order.createdAt,
      shippingAddress: {
        firstName: order.firstName,
        lastName: order.lastName,
        fullAddress: order.fullAddress,
        townOrCity: order.townOrCity,
        state: order.state,
        country: order.country,
        pinCode: order.pinCode,
        mobileNumber: order.mobileNumber,
        emailAddress: order.emailAddress,
      }
    };

    res.status(200).json({
      order: {
        ...order.toJSON(),
        summary: orderSummary
      }
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
      return res
        .status(400)
        .json({ message: "Invalid or missing order id." });
    }

    const order = await Order.findOne({
      where: { id, userId },
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'createdAt', 'updatedAt'
      ]
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found or does not belong to you." });
    }

    // Only allow cancellation of pending orders
    if (order.status !== 'pending') {
      return res.status(400).json({ 
        message: `Cannot cancel order with status: ${order.status}. Only pending orders can be cancelled.` 
      });
    }

    // Update order status to cancelled
    await order.update({ status: 'cancelled' });

    res.status(200).json({
      message: "Order cancelled successfully.",
      order: {
        id: order.id,
        status: order.status,
        cancelledAt: new Date()
      }
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
      return res
        .status(400)
        .json({ message: "Invalid or missing order ID." });
    }
    const order = await Order.findOne({
      where: { id: orderId, userId },
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'shipmentId', 'awbCode', 'shipmentStatus', 'shippingLabelUrl',
        'createdAt', 'updatedAt'
      ]
    });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const awb = order.awbCode;
    if (getDelhiveryConfig().isConfigured && awb) {
      const result = await delhiveryTrack(awb);
      if (result.success) {
        return res.status(200).json({
          message: "Tracking fetched successfully.",
          orderId: order.id,
          status: order.status,
          awb,
          tracking: result.tracking,
          scans: result.scans,
          labelUrl: order.shippingLabelUrl,
        });
      }
    }

    if (order.shipmentId && !getDelhiveryConfig().isConfigured) {
      const token = await getShiprocketToken();
      const trackUrl = `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${order.shipmentId}`;
      const response = await fetch(trackUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });
      const data = await response.json();
      if (response.ok && (data?.tracking_data?.track_url || data?.tracking_data)) {
        return res.status(200).json({
          message: "Tracking fetched successfully.",
          tracking: data.tracking_data,
        });
      }
    }

    return res.status(200).json({
      message: order.awbCode ? "Tracking not available yet. Please check back later." : "Shipment not yet created for this order.",
      orderId: order.id,
      status: order.status,
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

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  trackOrderStatus,
};
