const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware/authMiddleware");
const sellerReviewUpload = require("../middleware/sellerReviewUpload");
const {
  getPerProductStats,
  listSellerReviews,
  listByProduct,
  getOne,
  create,
  update,
  remove,
} = require("../controllers/adminSellerReviewController");

function handleUpload(err, req, res, next) {
  if (err) {
    return res.status(400).json({ message: err.message || "Image upload failed." });
  }
  next();
}

router.get("/admin/seller-reviews/stats/per-product", isAdmin, getPerProductStats);
router.get("/admin/seller-reviews/by-product/:productId", isAdmin, listByProduct);
router.get("/admin/seller-reviews", isAdmin, listSellerReviews);
router.get("/admin/seller-reviews/:id", isAdmin, getOne);
router.post("/admin/seller-reviews", isAdmin, (req, res, next) => {
  sellerReviewUpload(req, res, (err) => handleUpload(err, req, res, next));
}, create);
router.put("/admin/seller-reviews/:id", isAdmin, (req, res, next) => {
  sellerReviewUpload(req, res, (err) => handleUpload(err, req, res, next));
}, update);
router.delete("/admin/seller-reviews/:id", isAdmin, remove);

module.exports = router;
