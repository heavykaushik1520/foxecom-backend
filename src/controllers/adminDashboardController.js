// src/controllers/adminDashboardController.js
const { Category, Product, User, Order, Cart, CartItem } = require("../models");
const { Sequelize, Op } = require("sequelize");

// Get admin dashboard statistics
async function getDashboardStats(req, res) {
  try {
    // Get basic counts
    const [totalCategories, totalProducts, totalUsers, totalOrders] = await Promise.all([
      Category.count(),
      Product.count(),
      User.count(),
      Order.count()
    ]);

    // Calculate total revenue
    const revenueResult = await Order.findAll({
      attributes: [[Sequelize.fn('SUM', Sequelize.col('totalAmount')), 'total']],
      raw: true
    });
    const totalRevenue = parseFloat(revenueResult[0]?.total || 0);

    // Get categories with products
    const categoriesWithProducts = await Category.findAll({
      include: [{
        model: Product,
        as: 'products',
        attributes: ['id'],
        required: false
      }],
      attributes: ['id', 'name']
    });

    // Get recent products
    const ProductImage = require('../models').ProductImage;
    const recentProducts = await Product.findAll({
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Category, as: 'category', attributes: ['name'], required: false },
        { model: ProductImage, as: 'images', limit: 1, required: false }
      ]
    });

    // Get recent orders
    const recentOrders = await Order.findAll({
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'email', 'role'], required: false }
      ]
    });

    // Calculate category statistics
    const categoryStats = categoriesWithProducts.map(category => ({
      id: category.id,
      name: category.name,
      productCount: category.products ? category.products.length : 0
    }));

    // Calculate monthly revenue (last 6 months) - simplified for cross-database compatibility
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Get all orders from last 6 months and calculate monthly totals in JavaScript
    const recentOrdersForRevenue = await Order.findAll({
      where: {
        createdAt: {
          [Op.gte]: sixMonthsAgo
        }
      },
      attributes: ['createdAt', 'totalAmount'],
      order: [['createdAt', 'ASC']]
    });

    // Group by month manually for cross-database compatibility
    const monthlyRevenueMap = {};
    recentOrdersForRevenue.forEach(order => {
      const monthKey = new Date(order.createdAt).toISOString().slice(0, 7); // YYYY-MM format
      if (!monthlyRevenueMap[monthKey]) {
        monthlyRevenueMap[monthKey] = 0;
      }
      monthlyRevenueMap[monthKey] += parseFloat(order.totalAmount || 0);
    });

    // Convert to array format
    const monthlyRevenue = Object.keys(monthlyRevenueMap).map(month => ({
      month,
      revenue: monthlyRevenueMap[month]
    })).sort((a, b) => a.month.localeCompare(b.month));

    res.status(200).json({
      stats: {
        totalCategories,
        totalProducts,
        totalUsers,
        totalOrders,
        totalRevenue: parseFloat(totalRevenue) || 0
      },
      categoryStats,
      recentProducts: recentProducts || [],
      recentOrders: recentOrders || [],
      monthlyRevenue: monthlyRevenue || []
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ 
      message: "Failed to fetch dashboard statistics", 
      error: error.message 
    });
  }
}

// Get products by category for admin
async function getProductsByCategory(req, res) {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where: { categoryId },
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']],
      include: [
        { model: require('../models').ProductImage, as: "images" },
        { model: Category, as: "category" }
      ]
    });

    res.status(200).json({
      category: {
        id: category.id,
        name: category.name
      },
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page)
      },
      products
    });
  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).json({ 
      message: "Failed to fetch products by category", 
      error: error.message 
    });
  }
}

// Bulk delete products (admin only)
async function bulkDeleteProducts(req, res) {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "Product IDs array is required" });
    }

    // Check if all products exist
    const existingProducts = await Product.findAll({
      where: { id: productIds },
      attributes: ['id', 'name']
    });

    if (existingProducts.length !== productIds.length) {
      return res.status(400).json({ 
        message: "Some products not found",
        found: existingProducts.length,
        requested: productIds.length
      });
    }

    const deletedCount = await Product.destroy({
      where: { id: productIds }
    });

    res.status(200).json({
      message: "Products deleted successfully",
      deletedCount,
      deletedProducts: existingProducts.map(p => ({ id: p.id, name: p.name }))
    });
  } catch (error) {
    console.error("Error bulk deleting products:", error);
    res.status(500).json({ 
      message: "Failed to bulk delete products", 
      error: error.message 
    });
  }
}

// Get all users with pagination (admin only)
async function getAllUsers(req, res) {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    if (search) {
      // User model only has 'email' field, no 'name' field
      where[Op.or] = [
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password'] } // Don't return password
    });

    res.status(200).json({
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page)
      },
      users
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ 
      message: "Failed to fetch users", 
      error: error.message 
    });
  }
}

// Get user profile with order history (admin only)
async function getUserProfile(req, res) {
  try {
    const { userId } = req.params;
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const orders = await Order.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: require('../models').OrderItem,
          as: 'orderItems',
          include: [
            { model: require('../models').Product, as: 'product', attributes: ['id', 'title', 'price'] }
          ]
        }
      ]
    });

    res.status(200).json({
      ...user.toJSON(),
      orderHistory: orders
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({
      message: "Failed to fetch user profile",
      error: error.message
    });
  }
}

// Get all orders for a user (admin only)
async function getUserOrders(req, res) {
  try {
    const { userId } = req.params;
    const orders = await Order.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: require('../models').OrderItem,
          as: 'orderItems',
          include: [
            { model: require('../models').Product, as: 'product', attributes: ['id', 'title', 'price'] }
          ]
        }
      ]
    });

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(500).json({
      message: "Failed to fetch user orders",
      error: error.message
    });
  }
}

module.exports = {
  getDashboardStats,
  getProductsByCategory,
  bulkDeleteProducts,
  getAllUsers,
  getUserProfile,
  getUserOrders
};
