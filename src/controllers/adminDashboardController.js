// src/controllers/adminDashboardController.js
const { Category, Product, User, Order, Cart, CartItem } = require("../models");
const { Sequelize, Op } = require("sequelize");

const PAID_STATUS = "paid";

/**
 * Get start of week (Monday) for a date.
 */
function getWeekStart(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Period key for grouping (day / week / month / year).
 */
function getPeriodKey(date, period) {
  const d = new Date(date);
  if (period === "daily") return d.toISOString().slice(0, 10); // YYYY-MM-DD
  if (period === "weekly") return getWeekStart(d).toISOString().slice(0, 10); // week start date
  if (period === "monthly") return d.toISOString().slice(0, 7); // YYYY-MM
  if (period === "yearly") return d.toISOString().slice(0, 4); // YYYY
  return d.toISOString().slice(0, 10);
}

function sumRevenue(rows) {
  return Math.round(
    rows.reduce((acc, r) => acc + parseFloat(r.totalAmount || 0), 0) * 100
  ) / 100;
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getThisWeekRange() {
  const start = getWeekStart(new Date());
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getThisMonthRange() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getThisYearRange() {
  const start = new Date();
  start.setMonth(0, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getDefaultDateRange(period) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  if (period === "daily") start.setDate(start.getDate() - 30);
  else if (period === "weekly") start.setDate(start.getDate() - 12 * 7);
  else if (period === "monthly") start.setMonth(start.getMonth() - 12);
  else if (period === "yearly") start.setFullYear(start.getFullYear() - 5);
  else start.setDate(start.getDate() - 30);

  start.setHours(0, 0, 0, 0);
  return { start, end };
}

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
    // Explicitly select only existing columns to avoid database errors
    const recentOrders = await Order.findAll({
      limit: 5,
      order: [['createdAt', 'DESC']],
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'flatNumber', 'buildingName', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'createdAt', 'updatedAt'
        // Excluding shiprocketOrderId, shipmentId, awbCode, courierName, shipmentStatus 
        // until these columns are added to the database
      ],
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
    // Explicitly select only existing columns
    const recentOrdersForRevenue = await Order.findAll({
      where: {
        createdAt: {
          [Op.gte]: sixMonthsAgo
        }
      },
      attributes: ['createdAt', 'totalAmount'], // Only select fields we need
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
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'flatNumber', 'buildingName', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'createdAt', 'updatedAt'
      ],
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
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'flatNumber', 'buildingName', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'createdAt', 'updatedAt'
      ],
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

/**
 * GET /admin/dashboard/revenue?period=daily|weekly|monthly|yearly&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * - Buckets revenue for paid orders.
 * - Returns "today/week/month/year" summaries + "byPeriod" list for selected period/range.
 */
async function getRevenueByPeriod(req, res) {
  try {
    const period = String(req.query.period || req.query.filter || "daily").toLowerCase();
    const allowed = ["daily", "weekly", "monthly", "yearly"];
    if (!allowed.includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Use daily, weekly, monthly, or yearly.",
      });
    }

    const hasStart = Boolean(req.query.startDate);
    const hasEnd = Boolean(req.query.endDate);

    let { start, end } = getDefaultDateRange(period);
    if (hasStart || hasEnd) {
      const parsedStart = hasStart ? new Date(req.query.startDate) : start;
      const parsedEnd = hasEnd ? new Date(req.query.endDate) : end;

      if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid startDate/endDate. Use YYYY-MM-DD.",
        });
      }

      start = new Date(parsedStart);
      start.setHours(0, 0, 0, 0);
      end = new Date(parsedEnd);
      end.setHours(23, 59, 59, 999);
    }

    const [todayOrders, weekOrders, monthOrders, yearOrders, ordersForPeriod] = await Promise.all([
      (() => {
        const { start: s, end: e } = getTodayRange();
        return Order.findAll({
          where: { status: PAID_STATUS, createdAt: { [Op.gte]: s, [Op.lte]: e } },
          attributes: ["totalAmount"],
          raw: true,
        });
      })(),
      (() => {
        const { start: s, end: e } = getThisWeekRange();
        return Order.findAll({
          where: { status: PAID_STATUS, createdAt: { [Op.gte]: s, [Op.lte]: e } },
          attributes: ["totalAmount"],
          raw: true,
        });
      })(),
      (() => {
        const { start: s, end: e } = getThisMonthRange();
        return Order.findAll({
          where: { status: PAID_STATUS, createdAt: { [Op.gte]: s, [Op.lte]: e } },
          attributes: ["totalAmount"],
          raw: true,
        });
      })(),
      (() => {
        const { start: s, end: e } = getThisYearRange();
        return Order.findAll({
          where: { status: PAID_STATUS, createdAt: { [Op.gte]: s, [Op.lte]: e } },
          attributes: ["totalAmount"],
          raw: true,
        });
      })(),
      Order.findAll({
        where: {
          status: PAID_STATUS,
          createdAt: { [Op.gte]: start, [Op.lte]: end },
        },
        attributes: ["createdAt", "totalAmount"],
        raw: true,
      }),
    ]);

    const summary = {
      today: { revenue: sumRevenue(todayOrders), orders: todayOrders.length },
      week: { revenue: sumRevenue(weekOrders), orders: weekOrders.length },
      month: { revenue: sumRevenue(monthOrders), orders: monthOrders.length },
      year: { revenue: sumRevenue(yearOrders), orders: yearOrders.length },
      range: {
        totalRevenue: sumRevenue(ordersForPeriod),
        totalOrders: ordersForPeriod.length,
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };

    const byPeriodMap = {};
    ordersForPeriod.forEach((row) => {
      const key = getPeriodKey(row.createdAt, period);
      if (!byPeriodMap[key]) {
        byPeriodMap[key] = { period: key, revenue: 0, orderCount: 0 };
      }
      byPeriodMap[key].revenue += parseFloat(row.totalAmount || 0);
      byPeriodMap[key].orderCount += 1;
    });

    const byPeriod = Object.values(byPeriodMap)
      .map((r) => ({
        ...r,
        revenue: Math.round(r.revenue * 100) / 100,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return res.status(200).json({
      success: true,
      period,
      summary,
      byPeriod,
    });
  } catch (error) {
    console.error("Error fetching admin revenue:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch revenue data",
      error: error.message,
    });
  }
}

module.exports = {
  getDashboardStats,
  getRevenueByPeriod,
  getProductsByCategory,
  bulkDeleteProducts,
  getAllUsers,
  getUserProfile,
  getUserOrders
};
