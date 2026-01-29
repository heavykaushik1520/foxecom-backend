// src/controllers/paymentController.js
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { Order, OrderItem, Product } = require("../models");
const razorpay = require("../config/razorpay");
const { sendOrderEmails } = require("../utils/sendOrderEmails");

// 1. Create Razorpay Order
async function createRazorpayOrder(req, res) {
  try {
    const { orderId } = req.body; // Internal Order ID
    const userId = req.user.userId;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    // Fetch the internal order
    const order = await Order.findOne({ 
      where: { id: orderId, userId },
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'razorpayOrderId', 'razorpayPaymentId', 
        'createdAt', 'updatedAt'
      ]
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.status === 'paid') {
        return res.status(400).json({ message: "Order is already paid." });
    }

    // Razorpay expects amount in paise (multiply by 100)
    const options = {
      amount: Math.round(order.totalAmount * 100), 
      currency: "INR",
      receipt: `order_rcptid_${order.id}`,
      payment_capture: 1 // Auto capture
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Save Razorpay Order ID to our database
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.status(200).json({
      message: "Razorpay order created successfully.",
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID // Send public key to frontend
    });

  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ message: "Failed to create payment order.", error: error.message });
  }
}

// 2. Verify Payment Signature
async function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user.userId;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification details." });
    }

    // Find the order using Razorpay Order ID
    const order = await Order.findOne({ 
      where: { razorpayOrderId: razorpay_order_id, userId },
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'razorpayOrderId', 'razorpayPaymentId', 
        'createdAt', 'updatedAt'
      ]
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found for verification." });
    }

    // Verify Signature
    // precise formula: hmac_sha256(razorpay_order_id + "|" + razorpay_payment_id, secret)
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      // payment is successful
      order.status = "paid";
      order.razorpayPaymentId = razorpay_payment_id;
      await order.save();

      // Send order confirmation emails to customer and admin
      try {
        // Fetch complete order with items and product details for email
        const completeOrder = await Order.findByPk(order.id, {
          attributes: [
            'id', 'userId', 'totalAmount', 'firstName', 'lastName',
            'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity',
            'country', 'state', 'pinCode', 'status',
            'razorpayOrderId', 'razorpayPaymentId',
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
                  attributes: ['id', 'title', 'price']
                }
              ]
            }
          ]
        });

        if (completeOrder && completeOrder.orderItems) {
          // Send emails asynchronously (don't block the response)
          sendOrderEmails(completeOrder.toJSON(), completeOrder.orderItems)
            .then(result => {
              console.log("Order emails sent:", result);
            })
            .catch(err => {
              console.error("Error sending order emails:", err);
            });
        }
      } catch (emailError) {
        // Log the error but don't fail the payment verification
        console.error("Error preparing order emails:", emailError);
      }

      res.status(200).json({ 
        message: "Payment verified successfully.", 
        status: "success",
        orderId: order.id 
      });
    } else {
      res.status(400).json({ 
        message: "Invalid signature. Payment verification failed.", 
        status: "failed" 
      });
    }

  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ message: "Failed to verify payment.", error: error.message });
  }
}

module.exports = {
  createRazorpayOrder,
  verifyPayment
};
