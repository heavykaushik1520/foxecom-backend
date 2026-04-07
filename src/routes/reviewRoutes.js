const express = require("express");
const router = express.Router();
const { getReviewsByProduct, getPublicSellerReviewsByProduct } = require("../controllers/reviewController");

router.get("/products/:productId/reviews", getReviewsByProduct);
router.get("/products/:productId/seller-reviews", getPublicSellerReviewsByProduct);

module.exports = router;
