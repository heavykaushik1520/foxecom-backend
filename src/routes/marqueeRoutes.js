const express = require("express");
const router = express.Router();
const marqueeController = require("../controllers/marqueeController");
const { isAdmin } = require("../middleware/authMiddleware");

// Public: send only active marquee
router.get("/marquees/active", marqueeController.getActiveMarquee);

// Admin: get all marquees
router.get("/admin/marquees", isAdmin, marqueeController.getAllMarquees);
// Admin: create marquee
router.post("/admin/marquees", isAdmin, marqueeController.createMarquee);
// Admin: update marquee
router.put("/admin/marquees/:id", isAdmin, marqueeController.updateMarquee);
// Admin: toggle active/inactive
router.patch("/admin/marquees/:id/toggle", isAdmin, marqueeController.toggleMarqueeStatus);
// Admin: delete marquee
router.delete("/admin/marquees/:id", isAdmin, marqueeController.deleteMarquee);

module.exports = router;
