// src/controllers/superadminDashboardController.js
const { Order, User, OrderItem, Product } = require("../models");
const { Op } = require("sequelize");

const VALID_FILTERS = ["daily", "weekly", "monthly"];
const VALID_SORT_FIELDS = ["createdAt", "totalAmount", "id", "status"];
const PAID_STATUS = "paid";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Get start of week (Monday) for a date
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
 * Get period key for grouping (day / week / month)
 */
function getPeriodKey(date, filter) {
  const d = new Date(date);
  if (filter === "daily") return d.toISOString().slice(0, 10);
  if (filter === "weekly") {
    const weekStart = getWeekStart(d);
    return weekStart.toISOString().slice(0, 10);
  }
  if (filter === "monthly") return d.toISOString().slice(0, 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Get date range for "today" (start and end of current day)
 */
function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Get date range for "this week" (Monday 00:00 to now)
 */
function getThisWeekRange() {
  const start = getWeekStart(new Date());
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Get date range for "this month" (1st 00:00 to now)
 */
function getThisMonthRange() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Get date range based on filter
 */
function getDateRange(filter) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  if (filter === "daily") {
    start.setDate(start.getDate() - 30);
  } else if (filter === "weekly") {
    start.setDate(start.getDate() - 12 * 7);
  } else {
    start.setMonth(start.getMonth() - 12);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * GET /api/superadmin/dashboard?filter=daily|weekly|monthly&page=1&limit=10&sortBy=createdAt&sortOrder=desc&search=
 */
async function getDashboard(req, res) {
  try {
    const filter = (req.query.filter || "daily").toLowerCase();
    if (!VALID_FILTERS.includes(filter)) {
      return res.status(400).json({
        success: false,
        message: "Invalid filter. Use daily, weekly, or monthly.",
      });
    }

    const page = Math.max(1, parseInt(req.query.page) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit) || DEFAULT_LIMIT));
    const sortBy = VALID_SORT_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : "createdAt";
    const sortOrder = (req.query.sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const search = (req.query.search || "").trim();

    const { start, end } = getDateRange(filter);

    const paidAndDateRange = {
      status: PAID_STATUS,
      createdAt: { [Op.gte]: start, [Op.lte]: end },
    };
    const dateRange = { status: PAID_STATUS, createdAt: { [Op.gte]: start, [Op.lte]: end } };
    let where = { ...dateRange };
    if (search) {
      const searchOr = [
        { emailAddress: { [Op.like]: `%${search}%` } },
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
      ];
      if (!isNaN(Number(search))) searchOr.push({ id: Number(search) });
      where = { [Op.and]: [dateRange, { [Op.or]: searchOr }] };
    }

    const orderListAttributes = [
      "id", "userId", "totalAmount", "firstName", "lastName", "mobileNumber",
      "emailAddress", "fullAddress", "townOrCity", "country", "state", "pinCode",
      "status", "payuTxnId", "payuPaymentId", "paymentMode", "bankRefNo", "payuStatus",
      "shiprocketOrderId", "shipmentId", "awbCode", "courierName", "shipmentStatus", "shippingLabelUrl",
      "createdAt", "updatedAt",
    ];

    const [ordersForSales, ordersPaginated, todayOrders, weekOrders, monthOrders] = await Promise.all([
      Order.findAll({
        where: paidAndDateRange,
        attributes: ["createdAt", "totalAmount"],
        raw: true,
      }),
      Order.findAndCountAll({
        where,
        limit,
        offset: (page - 1) * limit,
        order: [[sortBy, sortOrder]],
        attributes: orderListAttributes,
        include: [
          { model: User, as: "user", attributes: ["id", "email"], required: false },
          {
            model: OrderItem,
            as: "orderItems",
            attributes: ["id", "productId", "quantity", "priceAtPurchase"],
            include: [{ model: Product, as: "product", attributes: ["id", "title", "price"] }],
          },
        ],
      }),
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
    ]);

    const salesByPeriod = {};
    ordersForSales.forEach((row) => {
      const key = getPeriodKey(row.createdAt, filter);
      if (!salesByPeriod[key]) salesByPeriod[key] = { period: key, revenue: 0, orderCount: 0 };
      salesByPeriod[key].revenue += parseFloat(row.totalAmount || 0);
      salesByPeriod[key].orderCount += 1;
    });

    const salesData = Object.values(salesByPeriod).sort((a, b) =>
      a.period.localeCompare(b.period)
    );

    const totalRevenue = salesData.reduce((sum, p) => sum + p.revenue, 0);

    const sumRevenue = (rows) =>
      Math.round(rows.reduce((s, r) => s + parseFloat(r.totalAmount || 0), 0) * 100) / 100;

    res.status(200).json({
      success: true,
      filter,
      sales: {
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalOrders: ordersForSales.length,
          revenueToday: sumRevenue(todayOrders),
          ordersToday: todayOrders.length,
          revenueThisWeek: sumRevenue(weekOrders),
          ordersThisWeek: weekOrders.length,
          revenueThisMonth: sumRevenue(monthOrders),
          ordersThisMonth: monthOrders.length,
        },
        byPeriod: salesData,
      },
      orders: {
        data: ordersPaginated.rows,
        pagination: {
          totalItems: ordersPaginated.count,
          totalPages: Math.ceil(ordersPaginated.count / limit),
          currentPage: page,
          limit,
        },
      },
    });
  } catch (error) {
    console.error("Superadmin dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
      error: error.message,
    });
  }
}

module.exports = { getDashboard };
