/**
 * Builds the display order number: SKU_LAST4/DDMMYYYY/orderId
 * Example: 1663/14032026/50 for SKU "FOX IP16PROMAGS1663", date 14/03/2026, id 50.
 * @param {number} orderId - Order primary key
 * @param {Date|string} orderDate - Order created date
 * @param {string} [firstSku] - First product SKU (optional); digits extracted, last 4 used
 * @returns {string} Formatted order number e.g. "1663/14032026/50"
 */
function buildOrderNumber(orderId, orderDate, firstSku) {
  const digits = (String(firstSku || "").replace(/\D/g, "")).slice(-4);
  const skuPart = digits.length >= 4 ? digits : digits.padStart(4, "0");

  const d = orderDate instanceof Date ? orderDate : new Date(orderDate);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const datePart = `${day}${month}${year}`;

  return `${skuPart}/${datePart}/${orderId}`;
}

/**
 * Display ID for invoices/emails/UI: orderNumber if set, else fallback to id.
 * @param {{ orderNumber?: string | null, id: number }} order
 * @returns {string}
 */
function getOrderDisplayId(order) {
  if (order && order.orderNumber) return order.orderNumber;
  return order && order.id != null ? String(order.id) : "";
}

module.exports = {
  buildOrderNumber,
  getOrderDisplayId,
};
