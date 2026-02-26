const { Review, Product } = require("../models");
const { Op } = require("sequelize");

/**
 * List all reviews with pagination, filters, sort (admin)
 * GET /admin/reviews?page=1&limit=20&productId=&rating=&search=&sortBy=createdAt|rating&sortOrder=asc|desc
 */
async function getAllReviews(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const productId = req.query.productId ? parseInt(req.query.productId, 10) : null;
    const rating = req.query.rating ? parseInt(req.query.rating, 10) : null;
    const search = (req.query.search || "").trim();
    const sortBy = ["createdAt", "rating"].includes(req.query.sortBy) ? req.query.sortBy : "createdAt";
    const sortOrder = (req.query.sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = {};
    if (productId) where.productId = productId;
    if (rating >= 1 && rating <= 5) where.rating = rating;
    if (search) {
      where[Op.or] = [
        { reviewerName: { [Op.like]: `%${search}%` } },
        { reviewText: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows: reviews } = await Review.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [[sortBy, sortOrder]],
      include: [{ model: Product, as: "product", attributes: ["id", "title"] }],
    });

    return res.json({
      reviews,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching all reviews:", error);
    return res.status(500).json({ message: "Failed to fetch reviews." });
  }
}

/**
 * List reviews for a product (admin)
 */
async function getReviewsByProduct(req, res) {
  try {
    const { productId } = req.params;
    const reviews = await Review.findAll({
      where: { productId: parseInt(productId, 10) },
      order: [["createdAt", "DESC"]],
    });
    return res.json({ reviews });
  } catch (error) {
    console.error("Error fetching product reviews:", error);
    return res.status(500).json({ message: "Failed to fetch reviews." });
  }
}

/**
 * Create a review for a product (admin only)
 * Body: { reviewerName, rating, reviewText }
 */
async function createReview(req, res) {
  try {
    const { productId } = req.params;
    const { reviewerName, rating, reviewText } = req.body;
    const productIdNum = parseInt(productId, 10);

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    const product = await Product.findByPk(productIdNum);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    const review = await Review.create({
      productId: productIdNum,
      userId: null,
      reviewerName: (reviewerName || "").trim() || null,
      rating: parseInt(rating, 10),
      reviewText: (reviewText || "").trim() || null,
    });

    return res.status(201).json({ review });
  } catch (error) {
    console.error("Error creating review:", error);
    return res.status(500).json({ message: "Failed to create review." });
  }
}

/**
 * Update a review (admin only)
 */
async function updateReview(req, res) {
  try {
    const { id } = req.params;
    const { reviewerName, rating, reviewText } = req.body;

    const review = await Review.findByPk(parseInt(id, 10));
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    if (rating != null && (rating < 1 || rating > 5)) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    await review.update({
      ...(reviewerName !== undefined && { reviewerName: (reviewerName || "").trim() || null }),
      ...(rating !== undefined && { rating: parseInt(rating, 10) }),
      ...(reviewText !== undefined && { reviewText: (reviewText || "").trim() || null }),
    });

    return res.json({ review });
  } catch (error) {
    console.error("Error updating review:", error);
    return res.status(500).json({ message: "Failed to update review." });
  }
}

/**
 * Delete a review (admin only)
 */
async function deleteReview(req, res) {
  try {
    const { id } = req.params;
    const review = await Review.findByPk(parseInt(id, 10));
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }
    await review.destroy();
    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({ message: "Failed to delete review." });
  }
}

module.exports = {
  getAllReviews,
  getReviewsByProduct,
  createReview,
  updateReview,
  deleteReview,
};
