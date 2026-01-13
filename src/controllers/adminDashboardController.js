// src/controllers/adminDashboardController.js
const { Category, Product, User, Order, Cart, CartItem } = require("../models");

// Get admin dashboard statistics
async function getDashboardStats(req, res) {
  try {
    const [
      totalCategories,
      totalProducts,
      totalUsers,
      totalOrders,
      totalRevenue,
      categoriesWithProducts,
      recentProducts,
      recentOrders
    ] = await Promise.all([
      Category.count(),
      Product.count(),
      User.count(),
      Order.count(),
      Order.sum('totalAmount') || 0,
      Category.findAll({
        include: [{
          model: Product,
          as: 'products',
          attributes: ['id']
        }],
        attributes: ['id', 'name']
      }),
      Product.findAll({
        limit: 5,
        order: [['createdAt', 'DESC']],
        include: [
          { model: Category, as: 'category', attributes: ['name'] },
          { model: require('../models').ProductImage, as: 'images', limit: 1 }
        ]
      }),
      Order.findAll({
        limit: 5,
        order: [['createdAt', 'DESC']],
        include: [
          { model: User, as: 'user', attributes: ['name', 'email'] }
        ]
      })
    ]);

    // Calculate category statistics
    const categoryStats = categoriesWithProducts.map(category => ({
      id: category.id,
      name: category.name,
      productCount: category.products ? category.products.length : 0
    }));

    // Calculate monthly revenue (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyRevenue = await Order.findAll({
      where: {
        createdAt: {
          [require('sequelize').Op.gte]: sixMonthsAgo
        }
      },
      attributes: [
        [require('sequelize').fn('DATE_TRUNC', 'month', require('sequelize').col('createdAt')), 'month'],
        [require('sequelize').fn('SUM', require('sequelize').col('totalAmount')), 'revenue']
      ],
      group: [require('sequelize').fn('DATE_TRUNC', 'month', require('sequelize').col('createdAt'))],
      order: [[require('sequelize').fn('DATE_TRUNC', 'month', require('sequelize').col('createdAt')), 'ASC']]
    });

    res.status(200).json({
      stats: {
        totalCategories,
        totalProducts,
        totalUsers,
        totalOrders,
        totalRevenue: parseFloat(totalRevenue) || 0
      },
      categoryStats,
      recentProducts,
      recentOrders,
      monthlyRevenue
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
      where[require('sequelize').Op.or] = [
        { name: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { email: { [require('sequelize').Op.iLike]: `%${search}%` } }
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
          as: 'items',
          include: [
            { model: require('../models').Product, as: 'product', attributes: ['id', 'name', 'price'] }
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
          as: 'items',
          include: [
            { model: require('../models').Product, as: 'product', attributes: ['id', 'name', 'price'] }
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
