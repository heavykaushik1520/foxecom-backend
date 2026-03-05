const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware/authMiddleware");
const {
  getAllReviews,
  getReviewsByProduct,
  getRatingSummary,
  updateRatingSummary,
  createReview,
  updateReview,
  deleteReview,
} = require("../controllers/adminReviewController");

router.get("/admin/reviews", isAdmin, getAllReviews);
router.get("/admin/products/:productId/reviews", isAdmin, getReviewsByProduct);
router.get("/admin/products/:productId/rating-summary", isAdmin, getRatingSummary);
router.put("/admin/products/:productId/rating-summary", isAdmin, updateRatingSummary);
router.post("/admin/products/:productId/reviews", isAdmin, createReview);
router.put("/admin/reviews/:id", isAdmin, updateReview);
router.delete("/admin/reviews/:id", isAdmin, deleteReview);

module.exports = router;
