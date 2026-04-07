const { Review, ProductRatingSummary, CustomerReview, User, Product, SellerReview } = require("../models");

function maskEmail(email) {
  const value = String(email || "").trim();
  if (!value) return "Customer";
  if (!value.includes("@")) {
    // If we don't have a domain, mask the whole value.
    if (value.length <= 2) return `${value[0] || ""}***`;
    const first = value[0];
    const last = value[value.length - 1];
    const starCount = value.length - 2 >= 7 ? 7 : Math.max(1, value.length - 2);
    return `${first}${"*".repeat(starCount)}${last}`;
  }

  const [userPart, domain] = value.split("@");
  if (!domain) return "Customer";
  if (!userPart || userPart.length <= 2) return `${userPart[0] || ""}***@${domain}`;

  const first = userPart[0];
  const last = userPart[userPart.length - 1];
  const starCount = userPart.length - 2 >= 7 ? 7 : Math.max(1, userPart.length - 2);
  // Example: a*******z@gmail.com
  return `${first}${"*".repeat(starCount)}${last}@${domain}`;
}

function reviewerDisplayName(user) {
  if (!user) return "Customer";
  const email = user.email ? String(user.email) : "";
  return maskEmail(email);
}

/**
 * Purchaser-written reviews (CustomerReview), shaped like admin Review rows for the storefront.
 */
async function fetchCustomerReviewsPublic(productIdNum) {
  const rows = await CustomerReview.findAll({
    where: { productId: productIdNum },
    attributes: ["id", "rating", "reviewText", "createdAt", "isVerifiedPurchase"],
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "email"],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return rows.map((cr) => ({
    id: `customer-${cr.id}`,
    reviewerName: reviewerDisplayName(cr.user),
    rating: cr.rating,
    reviewText: cr.reviewText,
    createdAt: cr.createdAt,
    isVerifiedPurchase: Boolean(cr.isVerifiedPurchase),
  }));
}

function mergeReviewsByDate(adminRows, customerRows) {
  const adminJson = adminRows.map((r) => ({
    id: r.id,
    reviewerName: r.reviewerName,
    rating: r.rating,
    reviewText: r.reviewText,
    createdAt: r.createdAt,
    isVerifiedPurchase: false,
  }));
  return [...adminJson, ...customerRows].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Get reviews for a product (public, no auth required).
 * If product has an admin rating summary (star counts), returns that as primary data:
 * averageRating, totalCount, distribution (counts per star 1-5). The `reviews` array
 * still includes purchaser-written CustomerReview entries so the product page can list them.
 * Without a summary, merges admin Review rows and CustomerReview rows.
 */
async function getReviewsByProduct(req, res) {
  try {
    const { productId } = req.params;
    const productIdNum = parseInt(productId, 10);

    const customerReviews = await fetchCustomerReviewsPublic(productIdNum);

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
        reviews: customerReviews,
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

    const combined = mergeReviewsByDate(reviews, customerReviews);
    const avgRating =
      combined.length > 0
        ? combined.reduce((sum, r) => sum + r.rating, 0) / combined.length
        : 0;

    return res.json({
      reviews: combined,
      averageRating: Math.round(avgRating * 10) / 10,
      totalCount: combined.length,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return res.status(500).json({ message: "Failed to fetch reviews." });
  }
}

/**
 * Public: curated seller reviews for a product (no auth).
 * GET /products/:productId/seller-reviews
 */
async function getPublicSellerReviewsByProduct(req, res) {
  try {
    const productIdNum = parseInt(req.params.productId, 10);
    if (!productIdNum) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const product = await Product.findByPk(productIdNum, { attributes: ["id"] });
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    const rows = await SellerReview.findAll({
      where: { productId: productIdNum },
      attributes: ["id", "name", "rating", "message", "images", "reviewDate", "createdAt"],
      order: [
        ["reviewDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    const sellerReviews = rows.map((r) => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      message: r.message,
      images: Array.isArray(r.images) ? r.images : [],
      reviewDate: r.reviewDate != null ? String(r.reviewDate).slice(0, 10) : null,
      createdAt: r.createdAt,
    }));

    return res.json({ sellerReviews });
  } catch (error) {
    console.error("Error fetching seller reviews:", error);
    return res.status(500).json({ message: "Failed to fetch seller reviews." });
  }
}

module.exports = {
  getReviewsByProduct,
  getPublicSellerReviewsByProduct,
};
