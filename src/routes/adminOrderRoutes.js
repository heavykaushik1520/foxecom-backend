// routes/adminOrderRoutes.js

const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const { getAllOrdersForAdmin , getOrderById } = require('../controllers/adminOrderController');

router.get('/orders', isAdmin, getAllOrdersForAdmin);
router.get("/orders/:id", isAdmin, getOrderById);

module.exports = router;
