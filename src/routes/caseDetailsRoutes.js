const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  createCaseDetail,
  createAvailableModels,
  getAllCaseDetails,
  getCaseDetailById,
  updateCaseDetail,
  deleteCaseDetail,
} = require('../controllers/caseDetailsController');

// Public routes
router.get('/case-details', getAllCaseDetails);

// Admin-only routes (specific paths before :id)
router.post('/case-details/available-models', isAdmin, createAvailableModels);
router.post('/case-details', isAdmin, createCaseDetail);

router.get('/case-details/:id', getCaseDetailById);
router.put('/case-details/:id', isAdmin, updateCaseDetail);
router.delete('/case-details/:id', isAdmin, deleteCaseDetail);

module.exports = router;
