const { CustomerReview, Order, OrderItem, Product, User } = require("../models");

/**
 * Create or update a customer review for a product.
 * Only allowed if the user has at least one delivered order containing the product.
 */
async function createOrUpdateCustomerReview(req, res) {
  try {
    const userId = req.user?.userId;
    const { productId } = req.params;
    const { rating, reviewText } = req.body || {};

    if (!userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const productIdNum = parseInt(productId, 10);
    if (!productIdNum || Number.isNaN(productIdNum)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const numericRating = Number(rating);
    if (!numericRating || numericRating < 1 || numericRating > 5) {
      return res
        .status(400)
        .json({ message: "Rating must be a number between 1 and 5." });
    }

    const product = await Product.findByPk(productIdNum);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    // Check that the user has at least one delivered order containing this product
    const order = await Order.findOne({
      where: {
        userId,
        status: "delivered",
      },
      include: [
        {
          model: OrderItem,
          as: "orderItems",
          where: { productId: productIdNum },
          required: true,
        },
      ],
    });

    if (!order) {
      return res.status(403).json({
        message:
          "You can only review products that you have purchased and that have been delivered.",
      });
    }

    const sanitizedReviewText =
      typeof reviewText === "string" && reviewText.trim()
        ? reviewText.trim()
        : null;

    let review = await CustomerReview.findOne({
      where: { userId, productId: productIdNum },
    });

    if (review) {
      await review.update({
        rating: numericRating,
        reviewText: sanitizedReviewText,
        orderId: order.id,
        isVerifiedPurchase: true,
      });
    } else {
      review = await CustomerReview.create({
        userId,
        productId: productIdNum,
        orderId: order.id,
        rating: numericRating,
        reviewText: sanitizedReviewText,
        isVerifiedPurchase: true,
      });
    }

    return res.status(201).json({
      message: "Review saved successfully.",
      review,
    });
  } catch (error) {
    console.error("Error creating/updating customer review:", error);
    return res
      .status(500)
      .json({ message: "Failed to save review.", error: error.message });
  }
}

/**
 * Get customer reviews for a given product (public).
 */
async function getCustomerReviewsByProduct(req, res) {
  try {
    const { productId } = req.params;
    const productIdNum = parseInt(productId, 10);

    if (!productIdNum || Number.isNaN(productIdNum)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const reviews = await CustomerReview.findAll({
      where: { productId: productIdNum },
      attributes: [
        "id",
        "rating",
        "reviewText",
        "createdAt",
        "isVerifiedPurchase",
      ],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const totalCount = reviews.length;
    const averageRating =
      totalCount > 0
        ? Math.round(
            (reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount) * 10
          ) / 10
        : 0;

    return res.json({
      reviews,
      averageRating,
      totalCount,
    });
  } catch (error) {
    console.error("Error fetching customer reviews:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch customer reviews." });
  }
}

/**
 * Get all reviews created by the authenticated customer.
 */
async function getMyCustomerReviews(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const reviews = await CustomerReview.findAll({
      where: { userId },
      attributes: [
        "id",
        "rating",
        "reviewText",
        "createdAt",
        "isVerifiedPurchase",
      ],
      include: [
        {
          model: Product,
          as: "product",
          attributes: ["id", "title", "thumbnailImage"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json({ reviews });
  } catch (error) {
    console.error("Error fetching customer's own reviews:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch your reviews." });
  }
}

module.exports = {
  createOrUpdateCustomerReview,
  getCustomerReviewsByProduct,
  getMyCustomerReviews,
};

