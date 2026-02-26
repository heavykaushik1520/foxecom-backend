const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware/authMiddleware");
const {
  getAllReviews,
  getReviewsByProduct,
  createReview,
  updateReview,
  deleteReview,
} = require("../controllers/adminReviewController");

router.get("/admin/reviews", isAdmin, getAllReviews);
router.get("/admin/products/:productId/reviews", isAdmin, getReviewsByProduct);
router.post("/admin/products/:productId/reviews", isAdmin, createReview);
router.put("/admin/reviews/:id", isAdmin, updateReview);
router.delete("/admin/reviews/:id", isAdmin, deleteReview);

module.exports = router;
