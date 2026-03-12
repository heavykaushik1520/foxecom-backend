/**
 * UPI repeat-purchase discount helper.
 * Rules: 2nd purchase + UPI => 10%, 3rd purchase + UPI => 20%, 4th+ or non-UPI => 0%.
 */
const { Order } = require("../models");

const PAID_STATUSES = ["paid", "processing", "shipped", "delivered"];

/**
 * Get count of completed (paid or beyond) orders for a user.
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function getPaidOrderCount(userId) {
  const count = await Order.count({
    where: { userId, status: PAID_STATUSES },
  });
  return count;
}

/**
 * Get discount percent for given order number and payment method.
 * @param {number} nextOrderNumber - 1-based (1 = first order, 2 = second, ...)
 * @param {string} preferredPaymentMethod - 'UPI' or 'OTHER'
 * @returns {number} 0, 10, or 20
 */
function getUpiDiscountPercent(nextOrderNumber, preferredPaymentMethod) {
  if (String(preferredPaymentMethod).toUpperCase() !== "UPI") return 0;
  if (nextOrderNumber === 2) return 10;
  if (nextOrderNumber === 3) return 20;
  return 0;
}

module.exports = { getPaidOrderCount, getUpiDiscountPercent, PAID_STATUSES };
