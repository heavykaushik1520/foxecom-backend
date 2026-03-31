const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const { getLiveVisitors, getProductLiveViewers } = require('../controllers/visitorController');

router.get('/live-visitors', isAdmin, getLiveVisitors);
router.get('/product-live-viewers/:productId', isAdmin, getProductLiveViewers);

module.exports = router;
