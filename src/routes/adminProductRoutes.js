// src/routes/adminProductRoutes.js
const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');

// Admin-only product management routes (CREATE, UPDATE, DELETE operations)
router.post('/admin/products', isAdmin, createProduct);
router.put('/admin/products/:id', isAdmin, updateProduct);
router.delete('/admin/products/:id', isAdmin, deleteProduct);

module.exports = router;
