//routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const { createRazorpayOrder , verifyPayment } = require("../controllers/paymentController");
const { isUser } = require('../middleware/userAuthMiddleware');

router.post("/create-order", isUser, createRazorpayOrder);
router.post("/verify-payment",isUser , verifyPayment);

module.exports = router;
