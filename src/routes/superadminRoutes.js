// src/routes/superadminRoutes.js
const express = require("express");
const router = express.Router();
const { isSuperAdmin } = require("../middleware/authMiddleware");
const { getDashboard } = require("../controllers/superadminDashboardController");
const { createSuperAdmin } = require("../controllers/superadminController");

router.use(isSuperAdmin);

router.get("/dashboard", getDashboard);
router.post("/admins", createSuperAdmin);

module.exports = router;
