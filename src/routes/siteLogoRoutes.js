const express = require("express");
const router = express.Router();
const siteLogoController = require("../controllers/siteLogoController");
const logoUpload = require("../middleware/logoUpload");
const { isAdmin } = require("../middleware/authMiddleware");

router.get("/site-logo", siteLogoController.getSiteLogo);
router.get("/admin/site-logo", isAdmin, siteLogoController.getSiteLogo);
router.put("/admin/site-logo", isAdmin, logoUpload, siteLogoController.updateSiteLogo);

module.exports = router;
