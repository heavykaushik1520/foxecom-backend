// src/routes/adminDashboardRoutes.js
const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  getDashboardStats,
  getProductsByCategory,
  bulkDeleteProducts,
  getAllUsers,
  getUserProfile,
  getUserOrders
} = require('../controllers/adminDashboardController');

// Admin dashboard routes
router.get('/admin/dashboard/stats', isAdmin, getDashboardStats);
router.get('/admin/categories/:categoryId/products', isAdmin, getProductsByCategory);
router.delete('/admin/products/bulk', isAdmin, bulkDeleteProducts);
router.get('/admin/users', isAdmin, getAllUsers);

// Customer management routes (admin only)
router.get('/admin/users/:userId', isAdmin, getUserProfile);
router.get('/admin/users/:userId/orders', isAdmin, getUserOrders);

module.exports = router;
