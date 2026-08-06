/**
 * Normalizes checkout payment method values across API and DB.
 */

function normalizePreferredPaymentMethod(raw) {
  const v = String(raw || "OTHER").toUpperCase();
  if (v === "UPI") return "UPI";
  if (v === "COD") return "COD";
  return "OTHER";
}

function isCodOrder(order) {
  if (!order) return false;
  const pref = String(order.preferredPaymentMethod || "").toUpperCase();
  const mode = String(order.paymentMode || "").toUpperCase();
  return pref === "COD" || mode === "COD";
}

function isUnpaidPendingOrder(order) {
  if (!order) return false;
  return order.status === "pending" && !order.payuPaymentId;
}

function getEffectiveRefundType(order, policyRefundType) {
  if (isCodOrder(order) || isUnpaidPendingOrder(order)) return "none";
  return policyRefundType;
}

function getPaymentMethodLabel(order) {
  if (isCodOrder(order)) return "Cash on Delivery";
  const pref = String(order.preferredPaymentMethod || "").toUpperCase();
  if (pref === "UPI") return "UPI";
  if (pref === "OTHER") return "Card / Net Banking / Other";
  if (order.paymentMode) {
    const mode = String(order.paymentMode).trim();
    if (mode.toUpperCase() === "UPI") return "UPI";
    if (mode) return mode;
  }
  return "Online Payment";
}

module.exports = {
  normalizePreferredPaymentMethod,
  isCodOrder,
  isUnpaidPendingOrder,
  getEffectiveRefundType,
  getPaymentMethodLabel,
};
