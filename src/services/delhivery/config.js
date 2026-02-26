/**
 * Delhivery configuration from environment.
 * All Delhivery calls stay in backend only.
 */
function getDelhiveryConfig() {
  const baseUrl = (process.env.DELHIVERY_BASE_URL || 'https://staging-express.delhivery.com').replace(/\/+$/, '');
  const apiKey = process.env.DELHIVERY_API_KEY;
  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION || '';
  const warehouseCode = process.env.DELHIVERY_WAREHOUSE_CODE || process.env.DELHIVERY_PICKUP_LOCATION || '';

  return {
    baseUrl,
    apiKey,
    pickupLocation,
    warehouseCode,
    /** Client name for API (often same as pickup location or warehouse code - use warehouse code) */
    client: warehouseCode || pickupLocation,
    isConfigured: Boolean(apiKey && baseUrl && (pickupLocation || warehouseCode)),
  };
}

module.exports = { getDelhiveryConfig };
