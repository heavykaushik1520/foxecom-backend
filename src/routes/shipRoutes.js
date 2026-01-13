const express = require("express");
const router = express.Router();
const { shiprocketWebhook } = require("../controllers/webbhookController");
router.post("/shiprocket-webhook", shiprocketWebhook);
module.exports = router;
