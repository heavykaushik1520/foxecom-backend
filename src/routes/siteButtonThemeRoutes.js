const express = require("express");
const router = express.Router();
const siteButtonThemeController = require("../controllers/siteButtonThemeController");
const { isAdmin } = require("../middleware/authMiddleware");

router.get("/button-theme", siteButtonThemeController.getPublishedButtonTheme);
router.get("/admin/button-theme", isAdmin, siteButtonThemeController.getAdminButtonTheme);
router.put("/admin/button-theme/draft", isAdmin, siteButtonThemeController.saveDraftButtonTheme);
router.put("/admin/button-theme/publish", isAdmin, siteButtonThemeController.publishButtonTheme);

module.exports = router;
