const express = require("express");
const router = express.Router();
const variantGroupController = require("../controllers/variantGroupController");
const { isAdmin } = require("../middleware/authMiddleware");

router.get(
  "/admin/variant-groups",
  isAdmin,
  variantGroupController.getAllVariantGroups
);
router.get(
  "/admin/variant-groups/search-products",
  isAdmin,
  variantGroupController.searchProductsForVariantGroup
);
router.get(
  "/admin/variant-groups/:id",
  isAdmin,
  variantGroupController.getVariantGroupById
);
router.post(
  "/admin/variant-groups",
  isAdmin,
  variantGroupController.createVariantGroup
);
router.put(
  "/admin/variant-groups/:id",
  isAdmin,
  variantGroupController.updateVariantGroup
);
router.delete(
  "/admin/variant-groups/:id",
  isAdmin,
  variantGroupController.deleteVariantGroup
);

module.exports = router;
