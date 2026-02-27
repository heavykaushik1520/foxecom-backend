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
 * Normalize Delhivery status strings into internal lowercase codes.
 * Examples:
 *  - "Manifested"      -> "manifested"
 *  - "Picked Up"       -> "picked_up"
 *  - "In Transit"      -> "in_transit"
 *  - "Out For Delivery"-> "out_for_delivery"
 *  - "Delivered"       -> "delivered"
 */
function mapDelhiveryStatus(status) {
  if (!status || typeof status !== 'string') return null;
  const s = status.trim().toLowerCase();
  if (s === 'manifested') return 'manifested';
  if (s === 'picked up' || s === 'pickup' || s === 'pickedup') return 'picked_up';
  if (s === 'in transit' || s === 'transit') return 'in_transit';
  if (s === 'out for delivery' || s === 'ofd') return 'out_for_delivery';
  if (s === 'delivered') return 'delivered';
  return null;
}

/**
 * Bulk Waybill API – fetch multiple waybills.
 * Uses token + cl in query (Delhivery doc: waybill/api/bulk/json/?cl=client&token=key&count=N).
 * @param {number} count - Number of waybills (max 10000 per request, throttle 50k/5min)
 * @returns {Promise<{ success: boolean, waybills?: string[], error?: string }>}
 */
async function bulkWaybill(count = 1) {
  const { baseUrl, client, apiKey, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    log('error', 'Delhivery not configured');
    return { success: false, error: 'Delhivery not configured' };
  }
  if (!client) {
    log('error', 'Delhivery client not set (DELHIVERY_CLIENT or DELHIVERY_WAREHOUSE_CODE)');
    return { success: false, error: 'Client name required for bulk waybill' };
  }

  const cnt = Math.min(Math.max(1, count), 10000);
  const url = `${baseUrl}/waybill/api/bulk/json/?cl=${encodeURIComponent(client)}&token=${encodeURIComponent(apiKey)}&count=${cnt}`;
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
 * @param {object} [options] - { paymentMode?: string } – optional, used by internal callers only
 * @returns {Promise<{ success: boolean, serviceable?: boolean, prepaid?: boolean, cod?: boolean, error?: string }>}
 */
async function pincodeServiceability(pincode, options = {}) {
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
    return { success: false, error: res.error || 'Pincode check failed' };
  }

  const deliveryCodes = res.data?.delivery_codes;

  if (!Array.isArray(deliveryCodes) || deliveryCodes.length === 0) {
    return { success: true, serviceable: false, prepaid: false, cod: false };
  }

  const postal = deliveryCodes[0]?.postal_code;
  if (!postal) {
    return { success: true, serviceable: false, prepaid: false, cod: false };
  }

  const prepaid = postal.pre_paid === 'Y';
  const cod = postal.cod === 'Y';

  // Default behaviour (no payment mode provided): serviceable if either prepaid or COD is allowed.
  let serviceable = prepaid || cod;

  // When payment mode is known, enforce stricter rules:
  const pm = (options.paymentMode || '').toUpperCase();
  if (pm === 'COD') {
    // COD orders must be COD-serviceable.
    serviceable = !!cod;
  } else if (pm) {
    // Non-COD (prepaid) orders must be prepaid-serviceable.
    serviceable = !!prepaid;
  }

  return {
    success: true,
    serviceable,
    prepaid,
    cod,
  };
}

/**
 * TAT (Turn Around Time) API – estimated delivery days.
 * Uses Delhivery expected_tat: origin_pin, destination_pin, mot=S, pdt=B2C, expected_pickup_date.
 * @param {string} originPin - Origin pincode (warehouse)
 * @param {string} destPin - Destination pincode
 * @param {number} [weightGm] - Weight in grams (optional for TAT)
 * @returns {Promise<{ success: boolean, tatDays?: number, error?: string }>}
 */
async function getTAT(originPin, destPin, weightGm = 500) {
  const { baseUrl, originPin: configOrigin, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const o = String(originPin || configOrigin || '').replace(/\D/g, '').slice(0, 6);
  const d = String(destPin).replace(/\D/g, '').slice(0, 6);
  if (d.length !== 6) {
    return { success: false, error: 'Invalid destination pincode' };
  }
  const origin = o.length === 6 ? o : (configOrigin || '400001').replace(/\D/g, '').slice(0, 6);

  const expectedPickupDate = new Date();
  expectedPickupDate.setDate(expectedPickupDate.getDate() + 1);
  const dateStr = expectedPickupDate.toISOString().slice(0, 10);

  const url = `${baseUrl}/api/dc/expected_tat?origin_pin=${origin}&destination_pin=${d}&mot=S&pdt=B2C&expected_pickup_date=${dateStr}`;
  const res = await delhiveryRequest(url, { method: 'GET', headers: authHeaders() });

  if (!res.ok) {
    return { success: false, error: res.error || 'TAT check failed' };
  }

  const data = res.data;
  if (data == null || typeof data !== 'object') {
    return { success: true, tatDays: 5 };
  }
  const days = data.expected_tat_days ?? data.tat_days ?? data.tat ?? data.delivery_days;
  if (days != null) {
    const num = Number(days);
    return { success: true, tatDays: Number.isFinite(num) ? Math.max(1, Math.round(num)) : 5 };
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
 * Matches doc: name, add, pin, city, state, country, phone, order, payment_mode, weight, etc.
 * pickup_location is sent at root level in create payload, not inside each shipment.
 */
function buildShipmentPayload(order, waybill = null, options = {}) {
  const { client, pickupLocation, warehouseCode } = getDelhiveryConfig();
  const pickup = options.pickupLocation || pickupLocation || warehouseCode;
  const paymentMode = (options.paymentMode || 'Pre-paid').toLowerCase().includes('cod') ? 'COD' : 'Prepaid';
  const codAmount = paymentMode === 'COD' ? parseFloat(order.totalAmount || 0) : 0;

  const name = [order.firstName, order.lastName].filter(Boolean).join(' ').trim().slice(0, 100) || 'Customer';
  const add = [order.fullAddress, order.townOrCity, order.state].filter(Boolean).join(', ').slice(0, 500);
  const pin = String(order.pinCode || '').replace(/\D/g, '').slice(0, 6);
  let phone = String(order.mobileNumber || '').replace(/\D/g, '');
  if (phone.length > 10) phone = phone.slice(-10);

  const city = String(order.townOrCity || '').slice(0, 100) || '';
  const state = String(order.state || '').slice(0, 100) || '';
  const country = String(order.country || 'India').slice(0, 100);

  const weightGm = options.weightGm || 500;
  const shipment = {
    name,
    add,
    pin,
    city,
    state,
    country,
    phone,
    order: String(options.orderId != null ? options.orderId : order.id),
    payment_mode: paymentMode,
    return_pin: '',
    return_city: '',
    return_phone: '',
    return_add: '',
    return_state: '',
    return_country: '',
    products_desc: options.productsDesc || '',
    hsn_code: String(options.hsnCode || '998399'),
    cod_amount: codAmount > 0 ? codAmount.toFixed(2) : '',
    order_date: null,
    total_amount: codAmount > 0 ? String(codAmount) : '',
    seller_add: options.sellerAdd || '',
    seller_name: options.sellerName || '',
    seller_inv: options.sellerInv || '',
    quantity: options.quantity || '1',
    waybill: waybill || '',
    shipment_width: String(options.shipmentWidth || 10),
    shipment_height: String(options.shipmentHeight || 10),
    weight: String(weightGm),
    shipping_mode: options.shippingMode || 'Surface',
    address_type: options.addressType || 'default',
  };

  if (waybill) shipment.waybill = waybill;
  if (options.fragile) shipment.fragile_shipment = true;
  return shipment;
}

/**
 * Shipment Creation API.
 * POST body: format=json&data={"shipments":[{...}],"pickup_location":{"name":"..."}}
 * Before calling: check pincode serviceability, optionally fetch TAT and waybill.
 * @param {object} order - Order model instance or plain object with address fields
 * @param {object} [options] - { orderId, waybill, weightGm, paymentMode, sellerGstTin, hsnCode, fragile }
 * @returns {Promise<{ success: boolean, waybill?: string, shipmentId?: string, labelUrl?: string, error?: string }>}
 */
async function createShipment(order, options = {}) {
  const { baseUrl, pickupLocation, warehouseCode, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  // Idempotency guard: if this order already has an AWB, do not create again.
  const existingAwb =
    (order && (order.awbCode || order.awb || order.waybill)) || (options && (options.awb || options.waybill));
  if (existingAwb) {
    const existingShipmentId = order && (order.shipmentId || order.id);
    const labelUrl = `${baseUrl}/api/p/packing_slip?wbns=${existingAwb}`;
    log('info', 'Shipment already exists – skipping create', {
      orderId: order && order.id,
      awb: existingAwb,
      shipmentId: existingShipmentId,
    });
    return {
      success: true,
      waybill: existingAwb,
      shipmentId: String(existingShipmentId || ''),
      awb: existingAwb,
      labelUrl,
    };
  }

  const pickupName = options.pickupLocation || pickupLocation || warehouseCode;
  if (!pickupName) {
    log('error', 'Pickup location / warehouse name required for create');
    return { success: false, error: 'Pickup location not configured' };
  }

  const shipment = buildShipmentPayload(order, options.waybill || null, options);
  const payload = {
    shipments: [shipment],
    pickup_location: { name: pickupName },
  };

  const body = `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`;
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
  if (out && (out.success === false || (out.rmks && out.rmks.toLowerCase().includes('fail')))) {
    const errMsg = out.rmks || out.error || out.message || 'Shipment creation rejected';
    log('error', 'Shipment create rejected', { orderId: order.id, rmks: out.rmks });
    return { success: false, error: errMsg };
  }

  const packages = out && (out.packages || out.package || (Array.isArray(out) ? out : [out]));
  const first = Array.isArray(packages) ? packages[0] : packages;
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
 * @returns {Promise<{ success: boolean, status?: string, statusCode?: string, statusLocation?: string, statusDateTime?: string, scans?: array, raw?: object, error?: string }>}
 */
async function trackShipment(waybill) {
  const { baseUrl, isConfigured } = getDelhiveryConfig();
  if (!isConfigured) {
    return { success: false, error: 'Delhivery not configured' };
  }

  const url = `${baseUrl}/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}`;
  const res = await delhiveryRequest(url, { method: 'GET', headers: authHeaders() });

  if (!res.ok) {
    return { success: false, error: res.error || 'Tracking failed' };
  }

  const shipmentData = res.data?.ShipmentData;
  if (!Array.isArray(shipmentData) || shipmentData.length === 0) {
    return { success: false, error: 'No shipment data found' };
  }

  const shipment = shipmentData[0]?.Shipment;
  if (!shipment) {
    return { success: false, error: 'Invalid shipment structure' };
  }

  const scans = shipment.Scans?.map((s) => s.ScanDetail) || [];
  const rawStatus = shipment.Status?.Status || null;
  const normalizedStatus = mapDelhiveryStatus(rawStatus);

  return {
    success: true,
    status: normalizedStatus || rawStatus || null,
    statusCode: shipment.Status?.StatusCode,
    statusLocation: shipment.Status?.StatusLocation,
    statusDateTime: shipment.Status?.StatusDateTime,
    scans,
    raw: shipment,
    rawStatus,
  };
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
