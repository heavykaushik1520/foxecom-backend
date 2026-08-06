function getDelhiveryPaymentMode(order) {
  const pref = String(order.preferredPaymentMethod || "").toUpperCase();
  const mode = String(order.paymentMode || "").toUpperCase();

  if (pref === "COD" || mode === "COD") return "COD";

  const status = String(order.status || "").toLowerCase();

  if (
    status === "paid" ||
    status === "processing" ||
    status === "shipped" ||
    status === "delivered"
  ) {
    return "Prepaid";
  }

  return "Prepaid";
}

module.exports = {
  getDelhiveryPaymentMode,
};