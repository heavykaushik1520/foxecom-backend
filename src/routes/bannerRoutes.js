const express = require("express");
const router = express.Router();
const bannerController = require("../controllers/bannerController");
const bannerUpload = require("../middleware/bannerUpload");
const { isAdmin } = require("../middleware/authMiddleware");

// Public: get all banners for billboard
router.get("/banners", bannerController.getAllBanners);

// Admin: list banners
router.get("/admin/banners", isAdmin, bannerController.getAllBannersAdmin);
// Admin: create (requires desktopImage + mobileImage)
router.post("/admin/banners", isAdmin, bannerUpload, bannerController.createBanner);
// Admin: update (optional desktopImage and/or mobileImage)
router.put("/admin/banners/:id", isAdmin, bannerUpload, bannerController.updateBanner);
// Admin: delete
router.delete("/admin/banners/:id", isAdmin, bannerController.deleteBanner);
// Admin: reorder (body: { order: [id1, id2, ...] })
router.put("/admin/banners/reorder", isAdmin, bannerController.reorderBanners);

module.exports = router;
