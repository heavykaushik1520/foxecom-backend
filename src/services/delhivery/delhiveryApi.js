/**
 * Delhivery One API – all shipping APIs in one module.
 * Production-ready: retries, logging, graceful failure.
 * All Delhivery calls stay in backend only.
 */
const { getDelhiveryConfig } = require('./config');
const { delhiveryRequest } = require('./request');

const LOG_PREFIX = '[Delhivery]';

function log(level, msg, meta = {}) {
  const payload = { message: msg, ...meta };
  if (level === 'error') console.error(LOG_PREFIX, payload);
  else console.log(LOG_PREFIX, payload);
}

function authHeaders() {
  const { apiKey } = getDelhiveryConfig();
  return {
    Authorization: `Token ${apiKey}`,
  };
}

/**
 * Bulk Waybill API – fetch multiple waybills.
 * @param {number} count - Number of waybills (max 10000 per request, throttle 50k/5min)
 * @returns {Promise<{ success: boolean, waybills?: string[], error?: string }>}
 */
async function bulkWaybill(count = 1) {
  const { baseUrl, client, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    log('error', 'Delhivery not configured');
    return { success: false, error: 'Delhivery not configured' };
  }

  const url = `${baseUrl}/waybill/api/bulk/json/?cl=${encodeURIComponent(client)}&count=${Math.min(Math.max(1, count), 10000)}`;
  const res = await delhiveryRequest(url, { method: 'GET', headers: authHeaders() });

  if (!res.ok) {
    log('error', 'Bulk waybill failed', { status: res.status, error: res.error });
    return { success: false, error: res.error || 'Bulk waybill failed' };
  }

  const waybills = Array.isArray(res.data) ? res.data : (res.data && res.data.waybills) ? res.data.waybills : [];
  const list = waybills.map((w) => (typeof w === 'string' ? w : w.waybill || w)).filter(Boolean);
  log('info', 'Bulk waybill success', { count: list.length });
  return { success: true, waybills: list };
}

/**
 * Pincode Serviceability API.
 * @param {string} pincode - 6-digit pincode
 * @returns {Promise<{ success: boolean, serviceable?: boolean, prepaid?: boolean, cod?: boolean, error?: string }>}
 */
async function pincodeServiceability(pincode) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const pin = String(pincode).replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) {
    return { success: false, error: 'Invalid pincode' };
  }

  const url = `${baseUrl}/c/api/pin-codes/json/?filter_codes=${pin}`;
  const res = await delhiveryRequest(url, { method: 'GET', headers: authHeaders() });

  if (!res.ok) {
    log('error', 'Pincode serviceability failed', { pincode: pin, error: res.error });
    return { success: false, error: res.error || 'Pincode check failed' };
  }

  let data = res.data;
  if (data === 'NSZ' || data === null || data === undefined) {
    console.warn('[Delhivery] Pincode raw response:', typeof res.data, JSON.stringify(res.data).slice(0, 200));
    return { success: true, serviceable: false, prepaid: false, cod: false };
  }
  if (typeof data === 'object' && !Array.isArray(data)) {
    if (data[pin] !== undefined) data = data[pin];
    else if (data[String(pin)] !== undefined) data = data[String(pin)];
    else if (Object.keys(data).length === 1) data = data[Object.keys(data)[0]];
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.warn('[Delhivery] Pincode raw response: empty array for', pin);
      return { success: true, serviceable: false, prepaid: false, cod: false };
    }
    data = data.find((p) => String(p.pin || p.pincode || p) === pin) || data[0];
  }
  const prePaidVal = data && (data.pre_paid || data.prepaid || data['Pre-paid']);
  const codVal = data && (data.cod || data.COD);
  const notServiceable = !data || (prePaidVal === 'N' && codVal === 'N');
  if (notServiceable) {
    console.warn('[Delhivery] Pincode raw response (not serviceable):', JSON.stringify(res.data));
    return { success: true, serviceable: false, prepaid: false, cod: false };
  }

  const prepaid = prePaidVal === 'Y' || prePaidVal === 'y' || prePaidVal === true;
  const cod = codVal === 'Y' || codVal === 'y' || codVal === true;
  return {
    success: true,
    serviceable: prepaid || cod,
    prepaid,
    cod,
  };
}

/**
 * TAT (Turn Around Time) API – estimated delivery days.
 * Uses Delhivery rate/TAT by origin-destination when available; otherwise returns a safe default.
 * @param {string} originPin - Origin pincode (pickup)
 * @param {string} destPin - Destination pincode
 * @param {number} [weightGm] - Weight in grams
 * @returns {Promise<{ success: boolean, tatDays?: number, error?: string }>}
 */
async function getTAT(originPin, destPin, weightGm = 500) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const o = String(originPin).replace(/\D/g, '').slice(0, 6);
  const d = String(destPin).replace(/\D/g, '').slice(0, 6);
  if (o.length !== 6 || d.length !== 6) {
    return { success: false, error: 'Invalid pincode' };
  }

  const url = `${baseUrl}/c/api/pin-codes/json/?filter_codes=${d}`;
  const res = await delhiveryRequest(url, { method: 'GET', headers: authHeaders() });

  if (!res.ok) {
    return { success: false, error: res.error || 'TAT check failed' };
  }

  const data = res.data;
  if (!data || data === 'NSZ' || (typeof data === 'object' && data.pre_paid === 'N' && data.cod === 'N')) {
    return { success: true, tatDays: null, error: 'Pincode not serviceable' };
  }

  if (typeof data === 'object' && (data.expected_delivery_days != null || data.tat != null)) {
    const days = Number(data.expected_delivery_days ?? data.tat ?? 5);
    return { success: true, tatDays: Math.max(1, Math.round(days)) };
  }

  return { success: true, tatDays: 5 };
}

/**
 * Warehouse Creation API.
 * @param {object} payload - Warehouse details (name, address, etc.)
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
async function createWarehouse(payload) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const url = `${baseUrl}/api/backend/clientwarehouse/create/`;
  const res = await delhiveryRequest(url, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    log('error', 'Warehouse creation failed', { error: res.error });
    return { success: false, error: res.error || 'Warehouse creation failed' };
  }

  return { success: true, data: res.data };
}

/**
 * Build one shipment object for Delhivery create API.
 * Mandatory: pin, phone, address. Optional: waybill (blank for dynamic).
 */
function buildShipmentPayload(order, waybill = null, options = {}) {
  const { client, pickupLocation, warehouseCode } = getDelhiveryConfig();
  const pickup = options.pickupLocation || pickupLocation || warehouseCode;
  const paymentMode = (options.paymentMode || 'Pre-paid').toLowerCase().includes('cod') ? 'COD' : 'Pre-paid';
  const codAmount = paymentMode === 'COD' ? parseFloat(order.totalAmount || 0) : 0;

  const name = [order.firstName, order.lastName].filter(Boolean).join(' ').trim().slice(0, 100) || 'Customer';
  const add = [order.fullAddress, order.townOrCity, order.state].filter(Boolean).join(', ').slice(0, 500);
  const pin = String(order.pinCode || '').replace(/\D/g, '').slice(0, 6);
  let phone = String(order.mobileNumber || '').replace(/\D/g, '');
  if (phone.length > 10) phone = phone.slice(-10);

  const shipment = {
    name,
    add,
    pin,
    phone,
    order: String(options.orderId != null ? options.orderId : order.id),
    payment_mode: paymentMode,
    weight: options.weightGm || 500,
    seller_gst_tin: options.sellerGstTin || 'URP',
    hsn_code: String(options.hsnCode || '998399'),
    ...(codAmount > 0 && { cod_amount: codAmount.toFixed(2) }),
    pickup_location: { name: pickup },
    client: client || pickup,
  };

  if (waybill) shipment.waybill = waybill;
  if (options.fragile) shipment.fragile_shipment = true;
  return shipment;
}

/**
 * Shipment Creation API.
 * Before calling: check pincode serviceability, optionally fetch TAT and waybill.
 * @param {object} order - Order model instance or plain object with address fields
 * @param {object} [options] - { orderId, waybill, weightGm, paymentMode, sellerGstTin, hsnCode, fragile }
 * @returns {Promise<{ success: boolean, waybill?: string, shipmentId?: string, labelUrl?: string, error?: string }>}
 */
async function createShipment(order, options = {}) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const shipment = buildShipmentPayload(order, options.waybill || null, options);
  const dataArray = [shipment];
  const body = `format=json&data=${encodeURIComponent(JSON.stringify(dataArray))}`;

  const url = `${baseUrl}/api/cmu/create.json`;
  const res = await delhiveryRequest(url, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    log('error', 'Shipment creation failed', { orderId: order.id, error: res.error, data: res.data });
    return { success: false, error: res.error || 'Shipment creation failed' };
  }

  const out = res.data;
  const packages = out.packages || out.package || (Array.isArray(out) ? out : [out]);
  const first = packages[0];
  const waybill = first && (first.waybill || first.awb || first.wb);
  const refId = first && (first.reference_id || first.ref_id || first.order);
  const labelUrl = waybill ? `${getDelhiveryConfig().baseUrl}/api/p/packing_slip?wbns=${waybill}` : null;

  log('info', 'Shipment created', { orderId: order.id, waybill, refId });
  return {
    success: true,
    waybill: waybill || null,
    shipmentId: refId || String(order.id),
    awb: waybill || null,
    labelUrl,
  };
}

/**
 * Shipment Update API (edit order).
 * Allowed statuses: Scheduled, Pending, In Transit, Manifested.
 * @param {string} waybill - AWB number
 * @param {object} updates - { name?, add?, phone?, cod_amount?, gm?, shipment_height?, shipment_width?, shipment_length?, payment_mode? }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function updateShipment(waybill, updates) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const params = new URLSearchParams({ waybill, ...updates });
  const url = `${baseUrl}/api/p/edit?${params.toString()}`;
  const res = await delhiveryRequest(url, { method: 'POST', headers: authHeaders() });

  if (!res.ok) {
    log('error', 'Shipment update failed', { waybill, error: res.error });
    return { success: false, error: res.error || 'Shipment update failed' };
  }

  return { success: true };
}

/**
 * Shipment Cancellation API.
 * @param {string} waybill - AWB number
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function cancelShipment(waybill) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const params = new URLSearchParams({ waybill, cancellation: 'true' });
  const url = `${baseUrl}/api/p/edit?${params.toString()}`;
  const res = await delhiveryRequest(url, { method: 'POST', headers: authHeaders() });

  if (!res.ok) {
    log('error', 'Shipment cancellation failed', { waybill, error: res.error });
    return { success: false, error: res.error || 'Shipment cancellation failed' };
  }

  return { success: true };
}

/**
 * Shipping Label Generation API (packing slip).
 * Returns URL to fetch slip data; frontend can render or open in new tab.
 * @param {string} waybill - AWB number
 * @returns {Promise<{ success: boolean, labelUrl?: string, labelData?: object, error?: string }>}
 */
async function getLabel(waybill) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const labelUrl = `${baseUrl}/api/p/packing_slip?wbns=${waybill}`;
  const res = await delhiveryRequest(labelUrl, { method: 'GET', headers: authHeaders() });

  if (!res.ok) {
    return { success: false, error: res.error || 'Label fetch failed' };
  }

  return { success: true, labelUrl, labelData: res.data };
}

/**
 * Shipment Tracking API.
 * @param {string} waybill - AWB number
 * @returns {Promise<{ success: boolean, tracking?: object, scans?: array, error?: string }>}
 */
async function trackShipment(waybill) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const url = `${baseUrl}/api/v1/packages/?waybill=${encodeURIComponent(waybill)}`;
  const res = await delhiveryRequest(url, { method: 'GET', headers: authHeaders() });

  if (!res.ok) {
    log('error', 'Tracking failed', { waybill, error: res.error });
    return { success: false, error: res.error || 'Tracking failed' };
  }

  const data = res.data;
  const tracking = data && (data.tracking_data || data.scans != null ? data : null);
  const scans = (tracking && tracking.scans) || (Array.isArray(data) ? data : []);
  return { success: true, tracking: tracking || data, scans };
}

module.exports = {
  bulkWaybill,
  pincodeServiceability,
  getTAT,
  createWarehouse,
  createShipment,
  updateShipment,
  cancelShipment,
  getLabel,
  trackShipment,
  buildShipmentPayload,
  getDelhiveryConfig,
};
