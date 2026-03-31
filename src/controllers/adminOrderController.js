// controllers/adminOrderController.js

const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const { Order, OrderItem, Product, User } = require('../models');
const { createReviewRemindersForDeliveredOrder } = require("../services/reviewReminderService");

const GST_EXPORT_CONSTANTS = {
  sellerGstin: "09AANCR6672D1ZY",
  billFromCity: "INDIRAPURAM",
  billFromState: "Uttar Pradesh",
  billFromPostalCode: "201014",
  shipFromCity: "Gaziabad",
  shipFromState: "Uttar Pradesh",
  shipFromCountry: "India",
  shipFromPostalCode: "224601",
  defaultHsnSac: "39231090",
  defaultTaxRate: 18,
};

function formatDateTimeForSheet(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  const secs = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
}

function formatCompactDate(value) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}${month}${year}`;
}

function parseMonthRange(monthQuery) {
  const fallback = new Date();
  const monthString = typeof monthQuery === "string" && /^\d{4}-\d{2}$/.test(monthQuery)
    ? monthQuery
    : `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}`;

  const [year, month] = monthString.split("-").map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { monthString, start, end };
}

async function getAllOrdersForAdmin(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;  // Default 10 orders per page
    const offset = (page - 1) * limit;

    const { count, rows: orders } = await Order.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      attributes: [
        'id', 'userId', 'totalAmount', 'subtotal', 'discountAmount', 'upiDiscountPercent', 'preferredPaymentMethod', 'orderNumberForUser', 'orderNumber',
        'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'flatNumber', 'buildingName', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'shiprocketOrderId', 'shipmentId', 'awbCode', 'courierName', 'shipmentStatus', 'shippingLabelUrl',
        'createdAt', 'updatedAt'
      ],
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: [{ model: Product, as: 'product' }],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'role'],
        },
      ],
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        totalItems: count,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders', error: error.message });
  }
}

async function getOrderById(req, res) {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      where: { id },
      attributes: [
        'id', 'userId', 'totalAmount', 'subtotal', 'discountAmount', 'upiDiscountPercent', 'preferredPaymentMethod', 'orderNumberForUser', 'orderNumber',
        'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'flatNumber', 'buildingName', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'shiprocketOrderId', 'shipmentId', 'awbCode', 'courierName', 'shipmentStatus', 'shippingLabelUrl',
        'createdAt', 'updatedAt'
      ],
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: [{ model: Product, as: 'product' }],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'role'],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order', error: error.message });
  }
}

// Update order status (admin only)
async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, shiprocketOrderId, shipmentId, awbCode, courierName, shipmentStatus, shippingLabelUrl } = req.body;

    // Validate status
    const validStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const prevStatus = order.status;

    // Prepare update data
    const updateData = {};
    const requestedStatus = status;
    const nextStatus = requestedStatus === "delivered" ? "paid" : requestedStatus;
    if (requestedStatus) updateData.status = nextStatus;
    // Keep review eligibility consistent: if admin marks an order as delivered,
    // ensure shipmentStatus is also delivered.
    if (requestedStatus === "delivered" && updateData.shipmentStatus === undefined) {
      updateData.shipmentStatus = "delivered";
    }
    if (shiprocketOrderId !== undefined) updateData.shiprocketOrderId = shiprocketOrderId;
    if (shipmentId !== undefined) updateData.shipmentId = shipmentId;
    if (awbCode !== undefined) updateData.awbCode = awbCode;
    if (courierName !== undefined) updateData.courierName = courierName;
    if (shipmentStatus !== undefined) updateData.shipmentStatus = shipmentStatus;
    if (shippingLabelUrl !== undefined) updateData.shippingLabelUrl = shippingLabelUrl;

    await order.update(updateData);

    const isPaidRequestedTransition =
      requestedStatus === "paid" && prevStatus !== "paid";
    if (isPaidRequestedTransition) {
      try {
        await createReviewRemindersForDeliveredOrder({
          orderId: order.id,
          deliveredAt: new Date(),
        });
      } catch (e) {
        console.error(
          "[ReviewReminder] Failed to create reminders when admin sets paid:",
          e.message
        );
      }
    }

    // Fetch updated order with associations
    const updatedOrder = await Order.findByPk(id, {
      attributes: [
        'id', 'userId', 'totalAmount', 'subtotal', 'discountAmount', 'upiDiscountPercent', 'preferredPaymentMethod', 'orderNumberForUser', 'orderNumber',
        'firstName', 'lastName', 
          'mobileNumber', 'emailAddress', 'flatNumber', 'buildingName', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
        'shiprocketOrderId', 'shipmentId', 'awbCode', 'courierName', 'shipmentStatus', 'shippingLabelUrl',
        'createdAt', 'updatedAt'
      ],
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: [{ model: Product, as: 'product' }],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'role'],
        },
      ],
    });

    res.status(200).json({ 
      success: true, 
      message: 'Order updated successfully',
      data: updatedOrder 
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status', error: error.message });
  }
}

// Get orders with filters (admin only)
async function getOrdersWithFilters(req, res) {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      startDate,
      endDate,
      minAmount,
      maxAmount
    } = req.query;
    
    const offset = (page - 1) * limit;
    const where = {};
    // Status filter
    if (status) {
      const validStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (validStatuses.includes(status)) {
        where.status = status;
      }
    }

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate);
      }
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      where.totalAmount = {};
      if (minAmount) {
        where.totalAmount[Op.gte] = parseFloat(minAmount);
      }
      if (maxAmount) {
        where.totalAmount[Op.lte] = parseFloat(maxAmount);
      }
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: [{ model: Product, as: 'product' }],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'role'],
        },
      ],
    });

    // Search filter (by user email or order ID)
    let filteredOrders = orders;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredOrders = orders.filter(order => 
        order.user?.email?.toLowerCase().includes(searchLower) ||
        order.id.toString().includes(search) ||
        (order.orderNumber && order.orderNumber.toLowerCase().includes(searchLower)) ||
        order.payuTxnId?.toLowerCase().includes(searchLower)
      );
    }

    res.status(200).json({
      success: true,
      data: filteredOrders,
      pagination: {
        totalItems: search ? filteredOrders.length : count,
        totalPages: Math.ceil((search ? filteredOrders.length : count) / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching filtered orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders', error: error.message });
  }
}

async function exportGstMonthlyExcel(req, res) {
  try {
    const { monthString, start, end } = parseMonthRange(req.query.month);

    const orders = await Order.findAll({
      where: {
        createdAt: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: OrderItem,
          as: "orderItems",
          include: [{ model: Product, as: "product" }],
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("GST Details");

    worksheet.columns = [
      { header: "seller gstin", key: "sellerGstin", width: 20 },
      { header: "Invoice Number", key: "invoiceNumber", width: 30 },
      { header: "invoice date and time", key: "invoiceDateTime", width: 24 },
      { header: "transaction type", key: "transactionType", width: 14 },
      { header: "ordernumber", key: "orderNumber", width: 24 },
      { header: "shipmentId", key: "shipmentId", width: 20 },
      { header: "shipmenDate", key: "shipmentDate", width: 24 },
      { header: "OrderDate", key: "orderDate", width: 24 },
      { header: "Shipment Product/Item Id", key: "shipmentItemId", width: 20 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Product Title", key: "productTitle", width: 32 },
      { header: "sku", key: "sku", width: 20 },
      { header: "Bill From City", key: "billFromCity", width: 18 },
      { header: "Bill From State", key: "billFromState", width: 18 },
      { header: "Biil From PostalCode", key: "billFromPostalCode", width: 18 },
      { header: "Ship From City", key: "shipFromCity", width: 18 },
      { header: "Ship From State", key: "shipFromState", width: 18 },
      { header: "Ship From Country", key: "shipFromCountry", width: 18 },
      { header: "Ship Postal Code", key: "shipFromPostalCode", width: 16 },
      { header: "ship to city", key: "shipToCity", width: 18 },
      { header: "Ship To State", key: "shipToState", width: 18 },
      { header: "Ship To Country", key: "shipToCountry", width: 18 },
      { header: "shipping to postal code", key: "shipToPostalCode", width: 18 },
      { header: "invoice amount", key: "invoiceAmount", width: 14 },
      { header: "tax exclusive gross", key: "taxExclusiveGross", width: 16 },
      { header: "Total Tax Amount", key: "totalTaxAmount", width: 16 },
      { header: "Cgst Rate", key: "cgstRate", width: 10 },
      { header: "Sgst Rate", key: "sgstRate", width: 10 },
      { header: "Utgst Rate", key: "utgstRate", width: 10 },
      { header: "Igst Rate", key: "igstRate", width: 10 },
      { header: "Compensatory Cess Rate", key: "cessRate", width: 24 },
      { header: "Principal Amount", key: "principalAmount", width: 16 },
      { header: "Principal Amount Basis", key: "principalAmountBasis", width: 22 },
    ];

    for (const order of orders) {
      const shipmentDateRaw = order.awbCode || order.shipmentId ? order.updatedAt : order.createdAt;
      const isIntraState = (order.state || "").toLowerCase() === GST_EXPORT_CONSTANTS.shipFromState.toLowerCase();
      const cgstRate = isIntraState ? GST_EXPORT_CONSTANTS.defaultTaxRate / 2 : 0;
      const sgstRate = isIntraState ? GST_EXPORT_CONSTANTS.defaultTaxRate / 2 : 0;
      const igstRate = isIntraState ? 0 : GST_EXPORT_CONSTANTS.defaultTaxRate;
      const totalRate = cgstRate + sgstRate + igstRate;

      for (const item of order.orderItems || []) {
        const quantity = Number(item.quantity || 0);
        const lineAmount = Number(item.priceAtPurchase || 0) * quantity;
        const taxExclusiveGross = totalRate > 0 ? lineAmount / (1 + totalRate / 100) : lineAmount;
        const totalTaxAmount = lineAmount - taxExclusiveGross;
        const compactDate = formatCompactDate(order.createdAt);
        const invoiceNumber = `invoice-${order.id}-${compactDate}-${item.id}.pdf`;
        const fallbackOrderNumber = `${order.id}/${compactDate}/1`;

        worksheet.addRow({
          sellerGstin: GST_EXPORT_CONSTANTS.sellerGstin,
          invoiceNumber,
          invoiceDateTime: formatDateTimeForSheet(order.createdAt),
          transactionType: order.status === "cancelled" ? "refund" : "shipment",
          orderNumber: order.orderNumber || fallbackOrderNumber,
          shipmentId: order.awbCode || order.shipmentId || "",
          shipmentDate: formatDateTimeForSheet(shipmentDateRaw),
          orderDate: formatDateTimeForSheet(order.createdAt),
          shipmentItemId: item.id,
          quantity,
          productTitle: item.product?.title || "",
          sku: item.product?.sku || "",
          billFromCity: GST_EXPORT_CONSTANTS.billFromCity,
          billFromState: GST_EXPORT_CONSTANTS.billFromState,
          billFromPostalCode: GST_EXPORT_CONSTANTS.billFromPostalCode,
          shipFromCity: GST_EXPORT_CONSTANTS.shipFromCity,
          shipFromState: GST_EXPORT_CONSTANTS.shipFromState,
          shipFromCountry: GST_EXPORT_CONSTANTS.shipFromCountry,
          shipFromPostalCode: GST_EXPORT_CONSTANTS.shipFromPostalCode,
          shipToCity: order.townOrCity || "",
          shipToState: order.state || "",
          shipToCountry: order.country || "",
          shipToPostalCode: order.pinCode || "",
          invoiceAmount: Number(lineAmount.toFixed(2)),
          taxExclusiveGross: Number(taxExclusiveGross.toFixed(2)),
          totalTaxAmount: Number(totalTaxAmount.toFixed(2)),
          cgstRate,
          sgstRate,
          utgstRate: 0,
          igstRate,
          cessRate: 0,
          principalAmount: Number(taxExclusiveGross.toFixed(2)),
          principalAmountBasis: "Tax Exclusive",
        });
      }
    }

    const monthFilePart = monthString.replace("-", "_");
    const fileName = `gst-details-${monthFilePart}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting GST monthly excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export GST monthly excel",
      error: error.message,
    });
  }
}

module.exports = { 
  getAllOrdersForAdmin, 
  getOrderById, 
  updateOrderStatus,
  getOrdersWithFilters,
  exportGstMonthlyExcel,
};
