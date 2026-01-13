const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  createCaseDetail,
  getAllCaseDetails,
  getCaseDetailById,
  updateCaseDetail,
  deleteCaseDetail,
} = require('../controllers/caseDetailsController');

// Public routes
router.get('/case-details', getAllCaseDetails);
router.get('/case-details/:id', getCaseDetailById);

// Admin-only routes
router.post('/case-details', isAdmin, createCaseDetail);
router.put('/case-details/:id', isAdmin, updateCaseDetail);
router.delete('/case-details/:id', isAdmin, deleteCaseDetail);

module.exports = router;
