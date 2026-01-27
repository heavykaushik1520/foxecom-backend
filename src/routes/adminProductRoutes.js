// src/routes/adminProductRoutes.js
const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProductsForAdmin,
  getProductById,
} = require('../controllers/productController');

// Admin-only product management routes
router.get('/admin/products', isAdmin, getAllProductsForAdmin);
router.get('/admin/products/:id', isAdmin, getProductById);
router.post('/admin/products', isAdmin, createProduct);
router.put('/admin/products/:id', isAdmin, updateProduct);
router.delete('/admin/products/:id', isAdmin, deleteProduct);

module.exports = router;
