const express = require("express");
const router = express.Router();

const { isUser } = require("../middleware/userAuthMiddleware");
const {
  createOrUpdateCustomerReview,
  getCustomerReviewsByProduct,
  getMyCustomerReviews,
} = require("../controllers/customerReviewController");

// Public: list customer reviews for a product
router.get(
  "/products/:productId/customer-reviews",
  getCustomerReviewsByProduct
);

// Authenticated customer: create or update their review for a product
router.post(
  "/customer/products/:productId/reviews",
  isUser,
  createOrUpdateCustomerReview
);

// Authenticated customer: list their own reviews
router.get("/customer/my-reviews", isUser, getMyCustomerReviews);

module.exports = router;

