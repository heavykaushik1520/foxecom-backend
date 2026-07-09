/**
 * Combined Delhivery delivery estimate: serviceability + TAT + date range.
 */
const { getDelhiveryConfig } = require("./config");
const { pincodeServiceability, getTAT } = require("./delhiveryApi");
const {
  computeExpectedPickupDate,
  buildDeliveryRange,
  buildFallbackEstimate,
  getDispatchConfig,
} = require("../../utils/deliveryEstimateHelper");

const CACHE_TTL_MS = Number(process.env.DELIVERY_ESTIMATE_CACHE_TTL_MS) || 6 * 60 * 60 * 1000;
const estimateCache = new Map();

function normalizePincode(pincode) {
  return String(pincode || "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

function getCacheKey(originPin, destPin, pickupDate, paymentMode) {
  return `${originPin}:${destPin}:${pickupDate}:${paymentMode || "ANY"}`;
}

function getFromCache(key) {
  const entry = estimateCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    estimateCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache(key, value) {
  if (estimateCache.size > 5000) {
    const firstKey = estimateCache.keys().next().value;
    if (firstKey) estimateCache.delete(firstKey);
  }
  estimateCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * @param {object} options
 * @param {string} options.destPin - 6-digit destination pincode
 * @param {string} [options.paymentMode] - PREPAID | COD
 * @param {boolean} [options.allowFallback=true] - use fallback range if TAT fails
 */
async function getDeliveryEstimate(options = {}) {
  const destPin = normalizePincode(options.destPin);
  if (destPin.length !== 6) {
    return {
      success: false,
      error: "Invalid pincode. Must be 6 digits.",
    };
  }

  const { originPin: configOrigin, isConfigured } = getDelhiveryConfig();
  const originPin = normalizePincode(configOrigin) || "122003";
  const paymentMode = String(options.paymentMode || "PREPAID").toUpperCase();
  const allowFallback = options.allowFallback !== false;
  const expectedPickupDate = computeExpectedPickupDate();
  const dispatchConfig = getDispatchConfig();

  const cacheKey = getCacheKey(
    originPin,
    destPin,
    expectedPickupDate,
    paymentMode,
  );
  const cached = getFromCache(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  if (!isConfigured) {
    if (!allowFallback) {
      return { success: false, error: "Delhivery not configured" };
    }
    const fallback = buildFallbackEstimate(expectedPickupDate);
    setCache(cacheKey, fallback);
    return fallback;
  }

  const serviceResult = await pincodeServiceability(destPin, { paymentMode });

  if (!serviceResult.success) {
    if (!allowFallback) {
      return {
        success: false,
        error: serviceResult.error || "Pincode check failed",
      };
    }
    const fallback = {
      ...buildFallbackEstimate(expectedPickupDate),
      serviceable: false,
      prepaid: false,
      cod: false,
      pincodeError: serviceResult.error,
    };
    return fallback;
  }

  let serviceable = serviceResult.serviceable;
  if (paymentMode === "COD") serviceable = serviceResult.cod;
  else if (paymentMode === "PREPAID") serviceable = serviceResult.prepaid;

  if (!serviceable) {
    const result = {
      success: true,
      serviceable: false,
      prepaid: serviceResult.prepaid,
      cod: serviceResult.cod,
      tatDays: null,
      expectedPickupDate,
      estimatedDeliveryFrom: null,
      estimatedDeliveryTo: null,
      deliveryEstimateLabel: null,
      source: "delhivery",
      dispatchCutoffHour: dispatchConfig.cutoffHour,
      dispatchTimezone: dispatchConfig.timezone,
      dispatchNote: `Orders placed before ${dispatchConfig.cutoffHour}:00 IST are dispatched the same business day.`,
    };
    setCache(cacheKey, result);
    return result;
  }

  const tatResult = await getTAT(originPin, destPin, 500, {
    expectedPickupDate,
  });

  if (!tatResult.success || tatResult.tatDays == null) {
    if (!allowFallback) {
      return {
        success: false,
        error: tatResult.error || "TAT not available",
        serviceable: true,
        prepaid: serviceResult.prepaid,
        cod: serviceResult.cod,
      };
    }

    const fallback = {
      ...buildFallbackEstimate(expectedPickupDate),
      serviceable: true,
      prepaid: serviceResult.prepaid,
      cod: serviceResult.cod,
      tatError: tatResult.error,
    };
    setCache(cacheKey, fallback);
    return fallback;
  }

  const range = buildDeliveryRange(tatResult.tatDays, expectedPickupDate);

  const result = {
    success: true,
    serviceable: true,
    prepaid: serviceResult.prepaid,
    cod: serviceResult.cod,
    ...range,
    deliveryEstimateLabel: range.deliveryEstimateLabel,
    source: "delhivery",
    dispatchCutoffHour: dispatchConfig.cutoffHour,
    dispatchTimezone: dispatchConfig.timezone,
    dispatchNote: `Orders placed before ${dispatchConfig.cutoffHour}:00 IST are dispatched the same business day.`,
  };

  setCache(cacheKey, result);
  return result;
}

module.exports = {
  getDeliveryEstimate,
};
