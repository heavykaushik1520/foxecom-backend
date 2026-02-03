const { Review, Order, OrderItem, User } = require("../models");
const { Op } = require("sequelize");

/**
 * Check if user has purchased the product (order status = paid or delivered)
 */
async function hasUserPurchasedProduct(userId, productId) {
  const orders = await Order.findAll({
    where: {
      userId,
      status: { [Op.in]: ["paid", "processing", "shipped", "delivered"] },
    },
    attributes: ["id"],
  });
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length === 0) return false;

  const purchased = await OrderItem.findOne({
    where: { productId, orderId: { [Op.in]: orderIds } },
  });
  return !!purchased;
}

/**
 * Create a review (user must be logged in and must have purchased the product)
 */
async function createReview(req, res) {
  try {
    const userId = req.user.userId;
    const { productId, rating, reviewText } = req.body;

    if (!productId || !rating) {
      return res.status(400).json({
        message: "Product ID and rating are required.",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5.",
      });
    }

    const purchased = await hasUserPurchasedProduct(userId, parseInt(productId));
    if (!purchased) {
      return res.status(403).json({
        message: "You can only review products you have purchased.",
      });
    }

    const [review, created] = await Review.findOrCreate({
      where: { productId: parseInt(productId), userId },
      defaults: {
        productId: parseInt(productId),
        userId,
        rating: parseInt(rating),
        reviewText: reviewText || null,
      },
    });

    if (!created) {
      await review.update({
        rating: parseInt(rating),
        reviewText: reviewText || null,
      });
    }

    const fullReview = await Review.findByPk(review.id, {
      include: [
        { model: User, as: "user", attributes: ["id", "email"] },
      ],
    });

    return res.status(created ? 201 : 200).json({
      message: created ? "Review submitted successfully." : "Review updated successfully.",
      review: fullReview,
    });
  } catch (error) {
    console.error("Error creating review:", error);
    return res.status(500).json({ message: "Failed to submit review." });
  }
}

/**
 * Get reviews for a product (public, no auth required)
 */
async function getReviewsByProduct(req, res) {
  try {
    const { productId } = req.params;

    const reviews = await Review.findAll({
      where: { productId: parseInt(productId) },
      include: [
        { model: User, as: "user", attributes: ["id", "email"] },
      ],
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

/**
 * Check if current user can review a product (has purchased and not yet reviewed)
 */
async function checkCanReview(req, res) {
  try {
    const userId = req.user.userId;
    const { productId } = req.params;

    const purchased = await hasUserPurchasedProduct(userId, parseInt(productId));
    if (!purchased) {
      return res.json({ canReview: false, reason: "You have not purchased this product." });
    }

    const existingReview = await Review.findOne({
      where: { productId: parseInt(productId), userId },
    });

    return res.json({
      canReview: true,
      existingReview: existingReview
        ? {
            id: existingReview.id,
            rating: existingReview.rating,
            reviewText: existingReview.reviewText,
          }
        : null,
    });
  } catch (error) {
    console.error("Error checking review eligibility:", error);
    return res.status(500).json({ message: "Failed to check review eligibility." });
  }
}

module.exports = {
  createReview,
  getReviewsByProduct,
  checkCanReview,
};
