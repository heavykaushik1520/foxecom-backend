const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload'); // Your existing multer config
const uploadController = require('../controllers/uploadController'); // The new controller
const { isAdmin } = require('../middleware/authMiddleware'); // Assuming you have an auth middleware

router.post('/banner', isAdmin, upload.single('image'), uploadController.uploadBannerImage);

module.exports = router;