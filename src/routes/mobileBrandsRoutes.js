const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  createMobileBrand,
  getAllMobileBrands,
  getMobileBrandById,
  updateMobileBrand,
  deleteMobileBrand,
} = require('../controllers/mobileBrandsController');

// Public routes
router.get('/mobile-brands', getAllMobileBrands);
router.get('/mobile-brands/:id', getMobileBrandById);

// Admin-only routes
router.post('/mobile-brands', isAdmin, createMobileBrand);
router.put('/mobile-brands/:id', isAdmin, updateMobileBrand);
router.delete('/mobile-brands/:id', isAdmin, deleteMobileBrand);
router.delete('/mobile-brands/bulk', isAdmin, require('../controllers/mobileBrandsController').bulkDeleteMobileBrands);

module.exports = router;
