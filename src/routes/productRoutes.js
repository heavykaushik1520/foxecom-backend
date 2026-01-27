// src/routes/productRoutes.js

const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware'); // Import isAdmin middleware
const productUpload = require('../middleware/productUpload'); // Import productUpload middleware
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  searchProductsByName,
  filterProducts,
  filterAndSortProducts,
  getFilterOptions
} = require('../controllers/productController');

// Public routes (no authentication required)
router.get('/products', getAllProducts);
router.get('/products/filter', filterAndSortProducts); // Enhanced filtering and sorting
router.get('/products/filter/options', getFilterOptions); // Get available filter options
router.get('/products/search', searchProductsByName);
router.get('/products/:id', getProductById);

// Admin-only routes (authentication required)
router.post('/products', isAdmin, productUpload, createProduct);
router.put('/products/:id', isAdmin, productUpload, updateProduct);
router.delete('/products/:id', isAdmin, deleteProduct);

module.exports = router;