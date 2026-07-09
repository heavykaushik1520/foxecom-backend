/**
 * Delhivery One shipping – single entry point.
 * All Delhivery calls stay in backend only.
 */
const api = require("./delhiveryApi");
const orderShipment = require("./orderShipment");
const { getDeliveryEstimate } = require("./deliveryEstimate");

module.exports = {
  ...api,
  ...orderShipment,
  getDeliveryEstimate,
};
