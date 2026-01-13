
const express = require('express');
const router = express.Router();
const { loginAdmin } = require('../controllers/authController');

router.post('/admin/login', loginAdmin);

module.exports = router;