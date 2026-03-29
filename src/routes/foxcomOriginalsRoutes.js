const express = require("express");
const router = express.Router();
const foxcomOriginalsController = require("../controllers/foxcomOriginalsController");
const { isAdmin } = require("../middleware/authMiddleware");

// Public: Get active FOXECOM Originals
router.get("/foxcom-originals", foxcomOriginalsController.getActiveFoxcomOriginals);

// Admin: Get all sections
router.get(
  "/admin/foxcom-originals",
  isAdmin,
  foxcomOriginalsController.getAllFoxcomOriginals
);

// Admin: Get section by ID
router.get(
  "/admin/foxcom-originals/:id",
  isAdmin,
  foxcomOriginalsController.getFoxcomOriginalsById
);

// Admin: Create section
router.post(
  "/admin/foxcom-originals",
  isAdmin,
  foxcomOriginalsController.createFoxcomOriginals
);

// Admin: Update section
router.put(
  "/admin/foxcom-originals/:id",
  isAdmin,
  foxcomOriginalsController.updateFoxcomOriginals
);

// Admin: Delete section
router.delete(
  "/admin/foxcom-originals/:id",
  isAdmin,
  foxcomOriginalsController.deleteFoxcomOriginals
);

module.exports = router;

