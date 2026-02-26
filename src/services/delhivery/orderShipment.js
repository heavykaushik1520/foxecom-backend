/**
 * Order → Delhivery shipment flow: serviceability, TAT, waybill, create, persist.
 * Called when order status is paid (and confirmed). All Delhivery calls in backend only.
 */
const {
  pincodeServiceability,
  getTAT,
  bulkWaybill,
  createShipment,
  getDelhiveryConfig,
} = require('./delhiveryApi');

const LOG_PREFIX = '[Delhivery OrderShipment]';

function log(msg, meta = {}) {
  console.log(LOG_PREFIX, { message: msg, ...meta });
}

/**
 * Before shipment creation: check pincode, fetch TAT, optionally fetch waybill.
 * @param {object} order - Order with pinCode, etc.
 * @param {boolean} [fetchWaybill] - If true, pre-fetch one waybill for this order
 * @returns {Promise<{ canCreate: boolean, serviceable?: boolean, tatDays?: number, waybill?: string, error?: string }>}
 */
async function prepareOrderForShipment(order, fetchWaybill = false) {
  const pin = String(order.pinCode || '').replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) {
    return { canCreate: false, error: 'Invalid pincode' };
  }

  const serviceability = await pincodeServiceability(pin);
  if (!serviceability.success) {
    return { canCreate: false, error: serviceability.error || 'Pincode check failed' };
  }
  if (!serviceability.serviceable) {
    return { canCreate: false, serviceable: false, error: 'Pincode not serviceable by Delhivery' };
  }

  const { pickupLocation, warehouseCode } = getDelhiveryConfig();
  const originPin = process.env.DELHIVERY_ORIGIN_PIN || ''; 
  const tatResult = await getTAT(originPin || '400001', pin, 500);
  const tatDays = tatResult.success ? tatResult.tatDays : null;

  let waybill = null;
  if (fetchWaybill) {
    const wb = await bulkWaybill(1);
    if (wb.success && wb.waybills && wb.waybills.length) waybill = wb.waybills[0];
  }

  return {
    canCreate: true,
    serviceable: true,
    tatDays,
    waybill,
  };
}

/**
 * Create Delhivery shipment for order and save waybill, shipmentId, AWB, labelUrl to Order.
 * Call this after order status is paid (and confirmed). Runs pre-checks then create.
 * @param {object} order - Order model instance (with orderItems if needed for weight)
 * @param {object} [options] - { fetchWaybill: boolean, sellerGstTin, hsnCode }
 * @returns {Promise<{ success: boolean, waybill?: string, shipmentId?: string, labelUrl?: string, error?: string }>}
 */
async function createOrderShipment(order, options = {}) {
  if (!order || !order.id) {
    return { success: false, error: 'Invalid order' };
  }

  const prepare = await prepareOrderForShipment(order, options.fetchWaybill === true);
  if (!prepare.canCreate) {
    console.warn(LOG_PREFIX, 'Prepare failed', { orderId: order.id, pinCode: order.pinCode, error: prepare.error });
    return { success: false, error: prepare.error };
  }

  const createResult = await createShipment(order, {
    orderId: order.id,
    waybill: prepare.waybill || undefined,
    weightGm: options.weightGm || 500,
    paymentMode: order.paymentMode || 'Pre-paid',
    sellerGstTin: options.sellerGstTin,
    hsnCode: options.hsnCode,
    ...options,
  });

  if (!createResult.success) {
    console.warn(LOG_PREFIX, 'Create failed', { orderId: order.id, error: createResult.error });
    return { success: false, error: createResult.error };
  }

  return {
    success: true,
    waybill: createResult.waybill,
    shipmentId: createResult.shipmentId,
    awb: createResult.awb,
    labelUrl: createResult.labelUrl,
  };
}

module.exports = {
  prepareOrderForShipment,
  createOrderShipment,
};
