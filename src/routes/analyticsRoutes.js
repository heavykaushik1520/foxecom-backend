const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  recordVisit,
  getSummary,
  getPageStats,
  getDailyStats,
  getSalesAnalytics,
} = require('../controllers/analyticsController');

router.post('/analytics/visit', recordVisit);
router.get('/analytics/summary', isAdmin, getSummary);
router.get('/analytics/pages', isAdmin, getPageStats);
router.get('/analytics/daily', isAdmin, getDailyStats);
router.get('/analytics/sales', isAdmin, getSalesAnalytics);

module.exports = router;
