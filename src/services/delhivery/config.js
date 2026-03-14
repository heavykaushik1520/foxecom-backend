/**
 * Delhivery One configuration from environment.
 * All Delhivery calls stay in backend only.
 */
function getDelhiveryConfig() {
  const baseUrl = (
    process.env.DELHIVERY_BASE_URL || 'https://staging-express.delhivery.com'
  ).replace(/\/+$/, '');

  const apiKey = (process.env.DELHIVERY_API_KEY || '').trim();

  /**
   * MUST be the exact pickup location name configured in Delhivery One.
   * Example: "IDEATORE-WH"
   */
  const pickupLocation = (process.env.DELHIVERY_PICKUP_LOCATION || '').trim();

  /**
   * Optional internal warehouse code (do NOT use this as pickup_location.name unless identical).
   */
  const warehouseCode = (process.env.DELHIVERY_WAREHOUSE_CODE || '').trim();

  /**
   * B2C client name for bulk waybill (and some accounts may require it).
   * Example: REDECOMSURFACE-B2C
   */
  const client = (process.env.DELHIVERY_CLIENT || '').trim();

  /**
   * Origin pincode of warehouse for TAT.
   */
  const originPin = (process.env.DELHIVERY_ORIGIN_PIN || '').trim();

  return {
    baseUrl,
    apiKey,
    pickupLocation,
    warehouseCode,
    client,
    originPin,
    isConfigured: Boolean(apiKey && baseUrl && pickupLocation),
  };
}

module.exports = { getDelhiveryConfig };