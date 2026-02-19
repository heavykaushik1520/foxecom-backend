// routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const {
  createPayuPayment,
  payuSuccessCallback,
  payuFailureCallback,
  verifyPayment,
} = require("../controllers/paymentController");
const { isUser } = require("../middleware/userAuthMiddleware");

// PayU: create payment params (frontend will POST form to PayU URL)
router.post("/create-order", isUser, createPayuPayment);
// PayU callbacks (PayU POSTs/GETs here; no auth - verified via hash)
// Accept both GET and POST as PayU test simulator may use GET
router.post("/payu-success", payuSuccessCallback);
router.get("/payu-success", payuSuccessCallback);
router.post("/payu-failure", payuFailureCallback);
router.get("/payu-failure", payuFailureCallback);
// Optional: frontend can call to verify order payment status
router.post("/verify-payment", isUser, verifyPayment);

module.exports = router;
