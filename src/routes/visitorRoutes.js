const express = require('express');
const router = express.Router();
const { optionalUserAuth } = require('../middleware/optionalUserAuthMiddleware');
const { postHeartbeat } = require('../controllers/visitorController');

router.post('/visitor/heartbeat', optionalUserAuth, postHeartbeat);

module.exports = router;
