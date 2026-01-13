const express = require('express');
const router = express.Router();

const { isUser} = require('../middleware/userAuthMiddleware');

const {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  trackOrderStatus
} = require("../controllers/orderController");

// Order management routes
router.post("/order", isUser, createOrder);
router.get("/order", isUser, getMyOrders);
router.get("/order/:id", isUser, getOrderById);
router.put("/order/:id/cancel", isUser, cancelOrder);

//created on 12-06
router.get('/track/:orderId', isUser, trackOrderStatus);


module.exports = router;

