
const express = require('express');
const router = express.Router();
const { isAdmin} = require('../middleware/authMiddleware');
const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');

// Public routes (no authentication required)
router.get('/categories', getAllCategories);
router.get('/categories/:id', getCategoryById);

// Admin-only routes (authentication required)
router.post('/categories', isAdmin, createCategory);
router.put('/categories/:id', isAdmin, updateCategory);
router.delete('/categories/:id', isAdmin, deleteCategory);
module.exports = router;