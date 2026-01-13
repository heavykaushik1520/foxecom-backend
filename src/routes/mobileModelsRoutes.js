const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  createMobileModel,
  getAllMobileModels,
  getMobileModelById,
  updateMobileModel,
  deleteMobileModel,
} = require('../controllers/mobileModelsController');

// Public routes
router.get('/mobile-models', getAllMobileModels);
router.get('/mobile-models/:id', getMobileModelById);

// Admin-only routes
router.post('/mobile-models', isAdmin, createMobileModel);
router.put('/mobile-models/:id', isAdmin, updateMobileModel);
router.delete('/mobile-models/:id', isAdmin, deleteMobileModel);

module.exports = router;
