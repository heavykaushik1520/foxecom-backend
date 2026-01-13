// src/routes/checkoutRoutes.js
const express = require('express');
const router = express.Router();
const { isUser } = require('../middleware/userAuthMiddleware');
const {
  getCheckoutSummary,
  validateShippingAddress,
  getPaymentMethods
} = require('../controllers/checkoutController');

// Checkout flow routes
router.get('/checkout/summary', isUser, getCheckoutSummary);
router.post('/checkout/validate-address', isUser, validateShippingAddress);
router.get('/checkout/payment-methods', isUser, getPaymentMethods);

module.exports = router;
