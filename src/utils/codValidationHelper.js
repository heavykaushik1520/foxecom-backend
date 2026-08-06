const {
  isCodEnabled,
  getCodMaxAmount,
  getCodMinAmount,
} = require("../config/codConfig");
const { getDeliveryEstimate } = require("../services/delhivery/deliveryEstimate");

/**
 * Server-side COD eligibility (pincode + amount + feature flag).
 * @param {{ pinCode: string|number, totalAmount: number|string }} params
 */
async function validateCodEligibility({ pinCode, totalAmount }) {
  if (!isCodEnabled()) {
    return {
      eligible: false,
      error: "Cash on Delivery is currently unavailable.",
    };
  }

  const amount = parseFloat(totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { eligible: false, error: "Invalid order amount for COD." };
  }

  const max = getCodMaxAmount();
  const min = getCodMinAmount();

  if (amount > max) {
    return {
      eligible: false,
      error: `Cash on Delivery is available for orders up to ₹${max.toLocaleString("en-IN")}.`,
    };
  }

  if (min > 0 && amount < min) {
    return {
      eligible: false,
      error: `Minimum order amount for Cash on Delivery is ₹${min.toLocaleString("en-IN")}.`,
    };
  }

  const destPin = String(pinCode || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (destPin.length !== 6) {
    return { eligible: false, error: "Valid 6-digit pincode is required for COD." };
  }

  const estimate = await getDeliveryEstimate({
    destPin,
    paymentMode: "COD",
    allowFallback: false,
  });

  if (!estimate.success && estimate.error) {
    return {
      eligible: false,
      error:
        estimate.error ||
        "Unable to verify Cash on Delivery for this pincode. Please try again.",
    };
  }

  if (estimate.serviceable === false || estimate.cod === false) {
    return {
      eligible: false,
      error: "Cash on Delivery is not available for your pincode.",
    };
  }

  return { eligible: true, deliveryEstimate: estimate };
}

module.exports = { validateCodEligibility };
