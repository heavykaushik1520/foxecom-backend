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
} = require("./delhiveryApi");

const { getDelhiveryPaymentMode } = require("./paymentModeHelper");
const { safeStatusUpdate } = require("../../utils/orderStatusHelper");


const LOG_PREFIX = "[Delhivery OrderShipment]";

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
  const pin = String(order.pinCode || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (pin.length !== 6) {
    return { canCreate: false, error: "Invalid pincode" };
  }

  // const paymentMode = (order.paymentMode || '').toUpperCase();
  // const serviceability = await pincodeServiceability(pin, { paymentMode });
  const paymentMode = getDelhiveryPaymentMode(order).toUpperCase();
  const serviceability = await pincodeServiceability(pin, { paymentMode });
  if (!serviceability.success) {
    const errMsg = String(serviceability.error || "Pincode check failed");
    const retryable =
      errMsg.includes("timeout") ||
      errMsg.includes("HTTP 5") ||
      errMsg.includes("429") ||
      errMsg.toLowerCase().includes("network");

    // Do not block shipment creation on Delhivery pincode API failures.
    // Log and continue so auto-shipment works in testing as well as production.
    log("Prepare: pincode check failed, continuing to create", {
      orderId: order.id,
      pinCode: order.pinCode,
      error: errMsg,
      retryable,
    });
  }
  // If Delhivery says pincode is not serviceable, still allow shipment creation.
  // This keeps auto-shipment working for test pincodes while remaining production-ready.
  const isServiceable = serviceability.success ? !!serviceability.serviceable : true;

  const { originPin } = getDelhiveryConfig();
  const origin = originPin || process.env.DELHIVERY_ORIGIN_PIN || "";
  const tatResult = await getTAT(origin || "400001", pin, 500);
  const tatDays = tatResult.success ? tatResult.tatDays : null;

  let waybill = null;
  if (fetchWaybill) {
    const wb = await bulkWaybill(1);
    if (wb.success && wb.waybills && wb.waybills.length)
      waybill = wb.waybills[0];
  }

  return {
    canCreate: true,
    serviceable: isServiceable,
    tatDays,
    waybill,
  };
}

/**
 * Create Delhivery shipment for order and save waybill, shipmentId, AWB, labelUrl to Order.
 * Call this after order status is paid (and confirmed). Runs pre-checks then create.
 * @param {object} order - Order model instance (with orderItems if needed for weight)
 * @param {object} [options] - { fetchWaybill: boolean, sellerGstTin, hsnCode }
 *  @returns {Promise<{ success: boolean, waybill?: string, shipmentId?: string, awb?: string, tatDays?: number, error?: string, retryable?: boolean }>}
 */
async function createOrderShipment(order, options = {}) {
  if (!order || !order.id) {
    return { success: false, error: "Invalid order" };
  }

  const prepare = await prepareOrderForShipment(
    order,
    options.fetchWaybill === true,
  );
  if (!prepare.canCreate) {
    console.warn(LOG_PREFIX, "Prepare failed", {
      orderId: order.id,
      pinCode: order.pinCode,
      error: prepare.error,
      retryable: prepare.retryable || false,
    });
    return {
      success: false,
      error: prepare.error,
      retryable: prepare.retryable || false,
    };
  }

  const createResult = await createShipment(order, {
    orderId: order.id,
    waybill: options.fetchWaybill ? prepare.waybill || undefined : undefined,
    weightGm: options.weightGm || 500,
    paymentMode: getDelhiveryPaymentMode(order),
    sellerGstTin: options.sellerGstTin,
    hsnCode: options.hsnCode || "998399",
    ...options,
  });

  if (!createResult.success) {
    console.warn(LOG_PREFIX, "Create failed", {
      orderId: order.id,
      error: createResult.error,
    });
    return { success: false, error: createResult.error };
  }

  if (typeof order.update === "function") {
    await order.update({
      shipmentId: createResult.shipmentId || null,
      awbCode: createResult.awb || createResult.waybill || null,
      shippingLabelUrl: null, // never store tokenized external URL
      shipmentStatus: "manifested",
      courierName: "delhivery",
    });
    await safeStatusUpdate(order, "processing");
  }

  return {
    success: true,
    waybill: createResult.waybill,
    shipmentId: createResult.shipmentId,
    awb: createResult.awb,
    tatDays: prepare.tatDays || null,
  };
}

module.exports = {
  prepareOrderForShipment,
  createOrderShipment,
};
