const { Review, ProductRatingSummary } = require("../models");

/**
 * Get reviews for a product (public, no auth required).
 * If product has an admin rating summary (star counts), returns that as primary data:
 * averageRating, totalCount, distribution (counts per star 1-5), reviews: [].
 * Otherwise returns individual reviews from Review table as before.
 */
async function getReviewsByProduct(req, res) {
  try {
    const { productId } = req.params;
    const productIdNum = parseInt(productId, 10);

    const summary = await ProductRatingSummary.findOne({
      where: { productId: productIdNum },
    });

    if (summary) {
      const count1 = summary.count1 || 0;
      const count2 = summary.count2 || 0;
      const count3 = summary.count3 || 0;
      const count4 = summary.count4 || 0;
      const count5 = summary.count5 || 0;
      const totalCount = count1 + count2 + count3 + count4 + count5;
      const averageRating =
        totalCount > 0
          ? (count1 * 1 + count2 * 2 + count3 * 3 + count4 * 4 + count5 * 5) / totalCount
          : 0;

      return res.json({
        reviews: [],
        averageRating: Math.round(averageRating * 10) / 10,
        totalCount,
        distribution: {
          1: count1,
          2: count2,
          3: count3,
          4: count4,
          5: count5,
        },
      });
    }

    const reviews = await Review.findAll({
      where: { productId: productIdNum },
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
