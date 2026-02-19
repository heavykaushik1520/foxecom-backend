// controllers/adminOrderController.js

const { Order, OrderItem, Product, User } = require('../models');

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
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
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
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
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
    const { status, shiprocketOrderId, shipmentId, awbCode, courierName, shipmentStatus } = req.body;

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

    // Prepare update data
    const updateData = {};
    if (status) updateData.status = status;
    if (shiprocketOrderId !== undefined) updateData.shiprocketOrderId = shiprocketOrderId;
    if (shipmentId !== undefined) updateData.shipmentId = shipmentId;
    if (awbCode !== undefined) updateData.awbCode = awbCode;
    if (courierName !== undefined) updateData.courierName = courierName;
    if (shipmentStatus !== undefined) updateData.shipmentStatus = shipmentStatus;

    await order.update(updateData);

    // Fetch updated order with associations
    const updatedOrder = await Order.findByPk(id, {
      attributes: [
        'id', 'userId', 'totalAmount', 'firstName', 'lastName', 
        'mobileNumber', 'emailAddress', 'fullAddress', 'townOrCity', 
        'country', 'state', 'pinCode', 'status', 
        'payuTxnId', 'payuPaymentId', 'paymentMode', 'bankRefNo', 'payuStatus', 'payuError', 
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
    const { Op } = require('sequelize');

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

module.exports = { 
  getAllOrdersForAdmin, 
  getOrderById, 
  updateOrderStatus,
  getOrdersWithFilters
};
