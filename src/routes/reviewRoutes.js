const express = require("express");
const router = express.Router();
const { isUser } = require("../middleware/userAuthMiddleware");
const {
  createReview,
  getReviewsByProduct,
  checkCanReview,
} = require("../controllers/reviewController");

// Public: Get reviews for a product
router.get("/products/:productId/reviews", getReviewsByProduct);

// Protected: Check if user can review (must be logged in)
router.get("/products/:productId/reviews/can-review", isUser, checkCanReview);

// Protected: Create or update review (must be logged in and have purchased)
router.post("/reviews", isUser, createReview);

module.exports = router;
