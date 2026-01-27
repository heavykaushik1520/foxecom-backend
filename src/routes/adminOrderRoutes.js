// routes/adminOrderRoutes.js

const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const { 
  getAllOrdersForAdmin, 
  getOrderById, 
  updateOrderStatus,
  getOrdersWithFilters 
} = require('../controllers/adminOrderController');

router.get('/orders', isAdmin, getAllOrdersForAdmin);
router.get('/orders/filter', isAdmin, getOrdersWithFilters);
router.get("/orders/:id", isAdmin, getOrderById);
router.put("/orders/:id/status", isAdmin, updateOrderStatus);

module.exports = router;
