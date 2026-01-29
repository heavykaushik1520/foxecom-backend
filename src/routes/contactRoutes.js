// src/routes/contactRoutes.js
const express = require("express");
const router = express.Router();

const { submitContactForm } = require("../controllers/contactController");

// Public route (no auth)
router.post("/contact", submitContactForm);

module.exports = router;

