const express = require("express");
const router = express.Router();
const buyOneGetOneController = require("../controllers/buyOneGetOneController");
const { isAdmin } = require("../middleware/authMiddleware");

// Public: Get active Buy One Get One section
router.get("/buy-one-get-one", buyOneGetOneController.getActiveBuyOneGetOne);

// Admin: Get all BOGO sections
router.get("/admin/buy-one-get-one", isAdmin, buyOneGetOneController.getAllBuyOneGetOne);

// Admin: Get BOGO section by ID
router.get("/admin/buy-one-get-one/:id", isAdmin, buyOneGetOneController.getBuyOneGetOneById);

// Admin: Create new BOGO section
router.post("/admin/buy-one-get-one", isAdmin, buyOneGetOneController.createBuyOneGetOne);

// Admin: Update BOGO section
router.put("/admin/buy-one-get-one/:id", isAdmin, buyOneGetOneController.updateBuyOneGetOne);

// Admin: Delete BOGO section
router.delete("/admin/buy-one-get-one/:id", isAdmin, buyOneGetOneController.deleteBuyOneGetOne);

module.exports = router;

