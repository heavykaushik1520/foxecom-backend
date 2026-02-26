const express = require("express");
const router = express.Router();
const { getReviewsByProduct } = require("../controllers/reviewController");

router.get("/products/:productId/reviews", getReviewsByProduct);

module.exports = router;
