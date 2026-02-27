/**
 * Delhivery API controller – all shipping APIs exposed as backend routes.
 * Proper error handling and logging. All Delhivery calls stay in backend.
 */
const {
  bulkWaybill,
  pincodeServiceability,
  getTAT,
  createWarehouse,
  createShipment,
  updateShipment,
  cancelShipment,
  getLabel,
  trackShipment,
  getDelhiveryConfig,
} = require('../services/delhivery/delhiveryApi');
const { createOrderShipment, prepareOrderForShipment } = require('../services/delhivery/orderShipment');
const { Order } = require('../models');
const { sendShipmentEmailToCustomer } = require('../utils/sendOrderEmails');

function sendError(res, status, message, error = null) {
  res.status(status).json({ success: false, message, ...(error && { error }) });
}

async function getBulkWaybill(req, res) {
  try {
    const count = Math.min(Math.max(1, parseInt(req.query.count, 10) || 1), 100);
    const result = await bulkWaybill(count);
    if (!result.success) {
      return sendError(res, 400, result.error || 'Bulk waybill failed');
    }
    res.status(200).json({ success: true, waybills: result.waybills });
  } catch (err) {
    console.error('[Delhivery] getBulkWaybill error', err);
    sendError(res, 500, 'Failed to fetch waybills', err.message);
  }
}

async function checkPincodeServiceability(req, res) {
  try {
    const pincode = req.query.pincode || req.params.pincode;
    if (!pincode) {
      return sendError(res, 400, 'Pincode is required');
    }
    const result = await pincodeServiceability(pincode);
    if (!result.success) {
      return sendError(res, 400, result.error || 'Pincode check failed');
    }
    res.status(200).json({
      success: true,
      serviceable: result.serviceable,
      prepaid: result.prepaid,
      cod: result.cod,
    });
  } catch (err) {
    console.error('[Delhivery] checkPincode error', err);
    sendError(res, 500, 'Failed to check pincode', err.message);
  }
}

async function getTat(req, res) {
  try {
    const originPin = req.query.originPin || req.query.origin || '';
    const destPin = req.query.destPin || req.query.dest || req.query.pincode;
    const weightGm = parseInt(req.query.weightGm, 10) || 500;
    if (!destPin) {
      return sendError(res, 400, 'Destination pincode (destPin or pincode) is required');
    }
    const result = await getTAT(originPin || '400001', destPin, weightGm);
    if (!result.success) {
      return sendError(res, 400, result.error || 'TAT fetch failed');
    }
    res.status(200).json({ success: true, tatDays: result.tatDays });
  } catch (err) {
    console.error('[Delhivery] getTAT error', err);
    sendError(res, 500, 'Failed to fetch TAT', err.message);
  }
}

async function createWarehouseRoute(req, res) {
  try {
    const result = await createWarehouse(req.body);
    if (!result.success) {
      return sendError(res, 400, result.error || 'Warehouse creation failed');
    }
    res.status(201).json({ success: true, data: result.data });
  } catch (err) {
    console.error('[Delhivery] createWarehouse error', err);
    sendError(res, 500, 'Failed to create warehouse', err.message);
  }
}

async function createShipmentRoute(req, res) {
  try {
    const orderId = req.body.orderId;
    if (!orderId) {
      return sendError(res, 400, 'orderId is required');
    }
    const order = await Order.findByPk(orderId);
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    const result = await createOrderShipment(order, {
      fetchWaybill: req.body.fetchWaybill === true,
      weightGm: req.body.weightGm,
      sellerGstTin: req.body.sellerGstTin,
      hsnCode: req.body.hsnCode,
    });
    if (!result.success) {
      return sendError(res, 400, result.error || 'Shipment creation failed');
    }
    await order.update({
      shipmentId: result.shipmentId || order.shipmentId,
      awbCode: result.awb || result.waybill || order.awbCode,
      shippingLabelUrl: result.labelUrl || order.shippingLabelUrl,
      shipmentStatus: 'created',
    });
    // Fire-and-forget: email shipment details to customer
    try {
      const trackBase = process.env.FRONTEND_URL || '';
      const trackUrl = trackBase
        ? `${trackBase.replace(/\/+$/, '')}/order/${order.id}/track`
        : null;
      await sendShipmentEmailToCustomer({
        order: order.toJSON ? order.toJSON() : order,
        awb: result.awb || result.waybill,
        labelUrl: result.labelUrl || null,
        trackUrl,
      });
    } catch (mailErr) {
      console.error('[Delhivery] Shipment email send failed (admin create)', mailErr.message);
    }
    res.status(201).json({
      success: true,
      waybill: result.waybill,
      shipmentId: result.shipmentId,
      awb: result.awb,
      labelUrl: result.labelUrl,
      orderId: order.id,
    });
  } catch (err) {
    console.error('[Delhivery] createShipment error', err);
    sendError(res, 500, 'Failed to create shipment', err.message);
  }
}

async function updateShipmentRoute(req, res) {
  try {
    const waybill = req.params.waybill || req.body.waybill;
    if (!waybill) {
      return sendError(res, 400, 'waybill is required');
    }
    const { name, add, phone, cod_amount, gm, shipment_height, shipment_width, shipment_length, payment_mode } = req.body;
    const updates = {};
    if (name != null) updates.name = name;
    if (add != null) updates.add = add;
    if (phone != null) updates.phone = phone;
    if (cod_amount != null) updates.cod_amount = cod_amount;
    if (gm != null) updates.gm = gm;
    if (shipment_height != null) updates.shipment_height = shipment_height;
    if (shipment_width != null) updates.shipment_width = shipment_width;
    if (shipment_length != null) updates.shipment_length = shipment_length;
    if (payment_mode != null) updates.pt = payment_mode;
    const result = await updateShipment(waybill, updates);
    if (!result.success) {
      return sendError(res, 400, result.error || 'Shipment update failed');
    }
    res.status(200).json({ success: true, message: 'Shipment updated' });
  } catch (err) {
    console.error('[Delhivery] updateShipment error', err);
    sendError(res, 500, 'Failed to update shipment', err.message);
  }
}

async function cancelShipmentRoute(req, res) {
  try {
    const waybill = req.params.waybill || req.body.waybill;
    if (!waybill) {
      return sendError(res, 400, 'waybill is required');
    }
    const result = await cancelShipment(waybill);
    if (!result.success) {
      return sendError(res, 400, result.error || 'Shipment cancellation failed');
    }
    res.status(200).json({ success: true, message: 'Shipment cancelled' });
  } catch (err) {
    console.error('[Delhivery] cancelShipment error', err);
    sendError(res, 500, 'Failed to cancel shipment', err.message);
  }
}

async function getLabelRoute(req, res) {
  try {
    const waybill = req.params.waybill || req.query.waybill;
    if (!waybill) {
      return sendError(res, 400, 'waybill is required');
    }
    const result = await getLabel(waybill);
    if (!result.success) {
      return sendError(res, 400, result.error || 'Label fetch failed');
    }
    res.status(200).json({ success: true, labelUrl: result.labelUrl, labelData: result.labelData });
  } catch (err) {
    console.error('[Delhivery] getLabel error', err);
    sendError(res, 500, 'Failed to fetch label', err.message);
  }
}

async function trackShipmentRoute(req, res) {
  try {
    const waybill = req.params.waybill || req.query.waybill;
    if (!waybill) {
      return sendError(res, 400, 'waybill is required');
    }
    const result = await trackShipment(waybill);
    if (!result.success) {
      return sendError(res, 400, result.error || 'Tracking failed');
    }
    res.status(200).json({
      success: true,
      status: result.status || null,
      statusCode: result.statusCode || null,
      statusLocation: result.statusLocation || null,
      statusDateTime: result.statusDateTime || null,
      scans: result.scans || [],
      tracking: result.raw || null, // keep legacy field name for backward compatibility
    });
  } catch (err) {
    console.error('[Delhivery] trackShipment error', err);
    sendError(res, 500, 'Failed to track shipment', err.message);
  }
}

async function prepareShipment(req, res) {
  try {
    const orderId = req.query.orderId || req.params.orderId;
    if (!orderId) {
      return sendError(res, 400, 'orderId is required');
    }
    const order = await Order.findByPk(orderId);
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    const fetchWaybill = req.query.fetchWaybill === 'true';
    const result = await prepareOrderForShipment(order, fetchWaybill);
    res.status(200).json(result);
  } catch (err) {
    console.error('[Delhivery] prepareShipment error', err);
    sendError(res, 500, 'Failed to prepare shipment', err.message);
  }
}

async function configStatus(req, res) {
  try {
    const config = getDelhiveryConfig();
    res.status(200).json({
      configured: config.isConfigured,
      baseUrl: config.baseUrl ? '[SET]' : null,
      hasApiKey: Boolean(config.apiKey),
      client: config.client || null,
      pickupLocation: config.pickupLocation || null,
      warehouseCode: config.warehouseCode || null,
      originPin: config.originPin || null,
    });
  } catch (err) {
    sendError(res, 500, 'Config check failed', err.message);
  }
}

module.exports = {
  getBulkWaybill,
  checkPincodeServiceability,
  getTat,
  createWarehouseRoute,
  createShipmentRoute,
  updateShipmentRoute,
  cancelShipmentRoute,
  getLabelRoute,
  trackShipmentRoute,
  prepareShipment,
  configStatus,
};
