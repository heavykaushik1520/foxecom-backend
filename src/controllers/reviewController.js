const { Review } = require("../models");

/**
 * Get reviews for a product (public, no auth required).
 * Returns reviewerName, rating, reviewText, createdAt (no user link).
 */
async function getReviewsByProduct(req, res) {
  try {
    const { productId } = req.params;

    const reviews = await Review.findAll({
      where: { productId: parseInt(productId, 10) },
      attributes: ["id", "reviewerName", "rating", "reviewText", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    return res.json({
      reviews,
      averageRating: Math.round(avgRating * 10) / 10,
      totalCount: reviews.length,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return res.status(500).json({ message: "Failed to fetch reviews." });
  }
}

module.exports = {
  getReviewsByProduct,
};
