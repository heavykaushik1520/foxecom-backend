// src/routes/adminCategoryRoutes.js
const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  createCategory,
  updateCategory,
  deleteCategory,
  bulkDeleteCategories,
} = require('../controllers/categoryController');

// Admin-only category management routes (CREATE, UPDATE, DELETE operations)
router.post('/admin/categories', isAdmin, createCategory);
router.put('/admin/categories/:id', isAdmin, updateCategory);
router.delete('/admin/categories/:id', isAdmin, deleteCategory);
router.delete('/admin/categories/bulk', isAdmin, bulkDeleteCategories);

module.exports = router;
