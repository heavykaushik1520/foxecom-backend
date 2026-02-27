/**
 * Delhivery configuration from environment.
 * All Delhivery calls stay in backend only.
 */
function getDelhiveryConfig() {
  const baseUrl = (process.env.DELHIVERY_BASE_URL || 'https://staging-express.delhivery.com').replace(/\/+$/, '');
  const apiKey = process.env.DELHIVERY_API_KEY;
  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION || '';
  const warehouseCode = process.env.DELHIVERY_WAREHOUSE_CODE || process.env.DELHIVERY_PICKUP_LOCATION || '';
  /** B2C client name (e.g. REDECOMSURFACE-B2C). If set, used for waybill and create API. */
  const client = process.env.DELHIVERY_CLIENT || warehouseCode || pickupLocation;
  /** Origin pincode for TAT estimation (warehouse/pickup pincode). */
  const originPin = process.env.DELHIVERY_ORIGIN_PIN || '';

  return {
    baseUrl,
    apiKey,
    pickupLocation,
    warehouseCode,
    client,
    originPin,
    isConfigured: Boolean(apiKey && baseUrl && (pickupLocation || warehouseCode || client)),
  };
}

module.exports = { getDelhiveryConfig };
