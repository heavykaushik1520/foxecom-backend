/**
 * Cash on Delivery and pending-order configuration (env-driven).
 */

function isCodEnabled() {
  return String(process.env.COD_ENABLED || "true").toLowerCase() !== "false";
}

function getCodMaxAmount() {
  const n = Number(process.env.COD_MAX_ORDER_AMOUNT);
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

function getCodMinAmount() {
  const n = Number(process.env.COD_MIN_ORDER_AMOUNT);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function getPendingOrderTtlMinutes() {
  const n = Number(process.env.PENDING_ORDER_TTL_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 45;
}

module.exports = {
  isCodEnabled,
  getCodMaxAmount,
  getCodMinAmount,
  getPendingOrderTtlMinutes,
};
