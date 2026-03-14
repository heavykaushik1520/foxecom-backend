function getDelhiveryPaymentMode(order) {
  // If your order is paid online => Prepaid
  // If you support COD => COD
  // Use your actual business flags, not gateway raw payment mode.
  const status = String(order.status || "").toLowerCase();

  // Example logic:
  if (String(order.paymentMode || "").toUpperCase() === "COD") return "COD";

  // If order already paid through PayU/UPI/Card/etc.
  if (
    status === "paid" ||
    status === "processing" ||
    status === "shipped" ||
    status === "delivered"
  ) {
    return "Prepaid";
  }

  // Default safe assumption
  return "Prepaid";
}

module.exports = {
  getDelhiveryPaymentMode,
};