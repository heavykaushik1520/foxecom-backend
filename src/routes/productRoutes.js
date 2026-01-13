// src/routes/productRoutes.js

const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware'); // Import isAdmin middleware
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  searchProductsByName,
  filterProducts
} = require('../controllers/productController');

// Public routes (no authentication required)
router.get('/products', getAllProducts);
router.get('/products/filter', filterProducts);
router.get('/products/search', searchProductsByName);
router.get('/products/:id', getProductById);

// Admin-only routes (authentication required)
router.post('/products', isAdmin, createProduct);
router.put('/products/:id', isAdmin, updateProduct);
router.delete('/products/:id', isAdmin, deleteProduct);

module.exports = router;