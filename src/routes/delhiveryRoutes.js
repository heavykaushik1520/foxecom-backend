/**
 * Delhivery shipping API routes – backend only.
 * Admin-only for sensitive operations; some read-only endpoints can be internal.
 */
const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const {
  getBulkWaybill,
  checkPincodeServiceability,
  getTat,
  createWarehouseRoute,
  createShipmentRoute,
  updateShipmentRoute,
  cancelShipmentRoute,
  getLabelRoute,
  trackShipmentRoute,
  prepareShipment,
  configStatus,
} = require('../controllers/delhiveryController');

router.get('/config', configStatus);

router.get('/waybill/bulk', isAdmin, getBulkWaybill);
router.get('/pincode/serviceability/:pincode', checkPincodeServiceability);
router.get('/pincode/serviceability', checkPincodeServiceability);
router.get('/tat', getTat);

router.post('/warehouse', isAdmin, createWarehouseRoute);

router.post('/shipment/create', isAdmin, createShipmentRoute);
router.put('/shipment/:waybill', isAdmin, updateShipmentRoute);
router.post('/shipment/:waybill/cancel', isAdmin, cancelShipmentRoute);

router.get('/shipment/label/:waybill', isAdmin, getLabelRoute);
router.get('/shipment/label', isAdmin, getLabelRoute);
router.get('/shipment/track/:waybill', trackShipmentRoute);
router.get('/shipment/track', trackShipmentRoute);

router.get('/order/:orderId/prepare', isAdmin, prepareShipment);
router.get('/order/prepare', isAdmin, prepareShipment);

module.exports = router;
