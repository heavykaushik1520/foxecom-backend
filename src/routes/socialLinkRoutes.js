const express = require("express");
const router = express.Router();
const socialLinkController = require("../controllers/socialLinkController");
const socialIconUpload = require("../middleware/socialIconUpload");
const { isAdmin } = require("../middleware/authMiddleware");

// Public: get active social links for footer
router.get("/social-links", socialLinkController.getPublicSocialLinks);

// Admin: get all social links
router.get("/admin/social-links", isAdmin, socialLinkController.getAllSocialLinks);

// Admin: create social link (supports multipart file upload or json body)
router.post("/admin/social-links", isAdmin, socialIconUpload, socialLinkController.createSocialLink);

// Admin: update social link
router.put("/admin/social-links/:id", isAdmin, socialIconUpload, socialLinkController.updateSocialLink);

// Admin: toggle active status
router.patch("/admin/social-links/:id/toggle", isAdmin, socialLinkController.toggleSocialLinkStatus);

// Admin: delete social link
router.delete("/admin/social-links/:id", isAdmin, socialLinkController.deleteSocialLink);

module.exports = router;
