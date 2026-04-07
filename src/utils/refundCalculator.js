const GST_RATE_PERCENT = parseFloat(process.env.GST_RATE_PERCENT || "18");
const COURIER_CHARGE_FLAT = parseFloat(process.env.COURIER_CHARGE_FLAT || "90");

function calculatePartialRefund(totalAmount) {
  const original = parseFloat(totalAmount) || 0;
  const gstDeducted = parseFloat(
    ((original * GST_RATE_PERCENT) / (100 + GST_RATE_PERCENT)).toFixed(2)
  );
  const courierDeducted = COURIER_CHARGE_FLAT;
  const totalDeducted = parseFloat((gstDeducted + courierDeducted).toFixed(2));
  const refundAmount = parseFloat(Math.max(0, original - totalDeducted).toFixed(2));
  const breakdown =
    `Original: ₹${original.toFixed(2)} | ` +
    `GST deducted: ₹${gstDeducted.toFixed(2)} (${GST_RATE_PERCENT}%) | ` +
    `Courier deducted: ₹${courierDeducted.toFixed(2)} | ` +
    `Refund: ₹${refundAmount.toFixed(2)}`;
  return { originalAmount: original, gstDeducted, courierDeducted, totalDeducted, refundAmount, breakdown };
}

module.exports = { calculatePartialRefund, GST_RATE_PERCENT, COURIER_CHARGE_FLAT };