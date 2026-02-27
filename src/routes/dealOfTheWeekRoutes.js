const express = require("express");
const router = express.Router();
const dealOfTheWeekController = require("../controllers/dealOfTheWeekController");
const { isAdmin } = require("../middleware/authMiddleware");

// Public: Get active Deal of the Week
router.get("/deal-of-the-week", dealOfTheWeekController.getActiveDealOfTheWeek);

// Admin: Get all deals
router.get("/admin/deal-of-the-week", isAdmin, dealOfTheWeekController.getAllDealsOfTheWeek);

// Admin: Get deal by ID
router.get("/admin/deal-of-the-week/:id", isAdmin, dealOfTheWeekController.getDealOfTheWeekById);

// Admin: Create new deal
router.post("/admin/deal-of-the-week", isAdmin, dealOfTheWeekController.createDealOfTheWeek);

// Admin: Update deal
router.put("/admin/deal-of-the-week/:id", isAdmin, dealOfTheWeekController.updateDealOfTheWeek);

// Admin: Delete deal
router.delete("/admin/deal-of-the-week/:id", isAdmin, dealOfTheWeekController.deleteDealOfTheWeek);

module.exports = router;
