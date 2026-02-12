// src/controllers/paymentController.js - PayU India payment integration
const crypto = require("crypto");
const { Order, OrderItem, Product } = require("../models");
const payuConfig = require("../config/payu");
const { sendOrderEmails } = require("../utils/sendOrderEmails");

/**
 * Generate PayU request hash (SHA-512).
 * Format: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
 */
function generatePayuRequestHash(params) {
  const key = params.key || payuConfig.key;
  const txnid = params.txnid || "";
  const amount = params.amount || "";
  const productinfo = params.productinfo || "";
  const firstname = params.firstname || "";
  const email = params.email || "";
  const udf1 = params.udf1 || "";
  const udf2 = params.udf2 || "";
  const udf3 = params.udf3 || "";
  const udf4 = params.udf4 || "";
  const udf5 = params.udf5 || "";
  const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${payuConfig.salt}`;
  return crypto.createHash("sha512").update(hashString).digest("hex").toLowerCase();
}

/**
 * Verify PayU response hash (reverse hash).
 * Format: salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
 */
function verifyPayuResponseHash(params) {
  const salt = payuConfig.salt;
  const status = params.status || "";
  const udf5 = params.udf5 || "";
  const udf4 = params.udf4 || "";
  const udf3 = params.udf3 || "";
  const udf2 = params.udf2 || "";
  const udf1 = params.udf1 || "";
  const email = params.email || "";
  const firstname = params.firstname || "";
  const productinfo = params.productinfo || "";
  const amount = params.amount || "";
  const txnid = params.txnid || "";
  const key = params.key || payuConfig.key;
  const hashString = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  const expectedHash = crypto.createHash("sha512").update(hashString).digest("hex").toLowerCase();
  return expectedHash === (params.hash || "").toLowerCase();
}

/**
 * Create PayU payment params for frontend form POST to PayU.
 * Frontend should submit these as application/x-www-form-urlencoded to payuConfig.paymentUrl.
 */
async function createPayuPayment(req, res) {
  try {
    const { orderId } = req.body;
    const userId = req.user.userId;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Order.findOne({
      where: { id: orderId, userId },
      attributes: [
        "id", "userId", "totalAmount", "firstName", "lastName",
        "mobileNumber", "emailAddress", "fullAddress", "townOrCity",
        "country", "state", "pinCode", "status",
        "payuTxnId", "payuPaymentId",
        "createdAt", "updatedAt",
      ],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.status === "paid") {
      return res.status(400).json({ message: "Order is already paid." });
    }

    const amount = parseFloat(order.totalAmount).toFixed(2);
    const txnid = `TXN_${order.id}_${Date.now()}`;
    const productinfo = `Order #${order.id}`;
    const firstname = (order.firstName || "").trim().substring(0, 50) || "Customer";
    const lastname = (order.lastName || "").trim().substring(0, 50) || "";
    const email = order.emailAddress || "";
    let phone = String(order.mobileNumber || "").replace(/\D/g, ""); // Remove non-digits
    if (phone.length > 10) phone = phone.substring(phone.length - 10); // Take last 10 digits
    if (phone.length < 10) phone = phone.padStart(10, "0"); // Pad to 10 digits if less
    phone = phone.substring(0, 15); // Max 15 chars for PayU
    const udf1 = String(order.id);

    const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const surl = `${process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`}/api/payment/payu-success`;
    const furl = `${process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`}/api/payment/payu-failure`;

    const hashParams = {
      key: payuConfig.key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1,
    };
    const hash = generatePayuRequestHash(hashParams);

    order.payuTxnId = txnid;
    await order.save();

    const paymentParams = {
      key: payuConfig.key,
      txnid,
      amount,
      productinfo,
      firstname,
      lastname: lastname || firstname, // PayU recommends lastname
      email,
      phone,
      address1: (order.fullAddress || "").substring(0, 100) || "",
      city: (order.townOrCity || "").substring(0, 50) || "",
      state: (order.state || "").substring(0, 50) || "",
      country: (order.country || "India").substring(0, 50) || "India",
      zipcode: (order.pinCode || "").substring(0, 10) || "",
      surl,
      furl,
      hash,
      udf1,
      service_provider: "payu_paisa",
    };

    res.status(200).json({
      message: "PayU payment params created successfully.",
      orderId: order.id,
      paymentUrl: payuConfig.paymentUrl,
      paymentParams,
    });
  } catch (error) {
    console.error("Error creating PayU payment:", error);
    res.status(500).json({ message: "Failed to create payment.", error: error.message });
  }
}

/**
 * PayU success callback (surl). PayU POSTs here after successful payment.
 * Verify hash, update order, then redirect to frontend success page.
 */
async function payuSuccessCallback(req, res) {
  try {
    const params = { ...req.body };

    if (!params.txnid || !params.hash) {
      return redirectToFrontend(res, "failure", null, "Missing payment data.");
    }

    if (!verifyPayuResponseHash(params)) {
      return redirectToFrontend(res, "failure", params.udf1 || null, "Invalid hash.");
    }

    if ((params.status || "").toLowerCase() !== "success") {
      return redirectToFrontend(res, "failure", params.udf1 || null, params.error_Message || "Payment failed.");
    }

    const orderId = params.udf1 ? parseInt(params.udf1, 10) : null;
    if (!orderId) {
      return redirectToFrontend(res, "failure", null, "Order not found.");
    }

    const order = await Order.findOne({
      where: { id: orderId, payuTxnId: params.txnid },
      attributes: ["id", "userId", "totalAmount", "status", "payuTxnId", "payuPaymentId"],
    });

    if (!order) {
      return redirectToFrontend(res, "failure", orderId, "Order not found.");
    }

    if (order.status === "paid") {
      return redirectToFrontend(res, "success", order.id, null, params.mihpayid);
    }

    order.status = "paid";
    order.payuPaymentId = params.mihpayid || params.paymentId || params.txnid;
    await order.save();

    try {
      const completeOrder = await Order.findByPk(order.id, {
        attributes: [
          "id", "userId", "totalAmount", "firstName", "lastName",
          "mobileNumber", "emailAddress", "fullAddress", "townOrCity",
          "country", "state", "pinCode", "status",
          "payuTxnId", "payuPaymentId",
          "createdAt", "updatedAt",
        ],
        include: [
          {
            model: OrderItem,
            as: "orderItems",
            include: [{ model: Product, as: "product", attributes: ["id", "title", "price"] }],
          },
        ],
      });
      if (completeOrder && completeOrder.orderItems) {
        sendOrderEmails(completeOrder.toJSON(), completeOrder.orderItems)
          .then((r) => console.log("Order emails sent:", r))
          .catch((err) => console.error("Error sending order emails:", err));
      }
    } catch (emailErr) {
      console.error("Error preparing order emails:", emailErr);
    }

    redirectToFrontend(res, "success", order.id, null, order.payuPaymentId);
  } catch (error) {
    console.error("Error in PayU success callback:", error);
    redirectToFrontend(res, "failure", null, "Verification failed.");
  }
}

/**
 * PayU failure callback (furl). PayU POSTs here after failed payment.
 */
async function payuFailureCallback(req, res) {
  try {
    const params = { ...req.body };
    const orderId = params.udf1 ? parseInt(params.udf1, 10) : null;
    const errorMsg = params.error_Message || params.error || "Payment failed.";
    redirectToFrontend(res, "failure", orderId, errorMsg);
  } catch (error) {
    console.error("Error in PayU failure callback:", error);
    redirectToFrontend(res, "failure", null, "Payment failed.");
  }
}

function redirectToFrontend(res, status, orderId, errorMessage, paymentId) {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const url = new URL(status === "success" ? "/payment/success" : "/payment/failure", baseUrl);
  if (orderId) url.searchParams.set("orderId", String(orderId));
  if (errorMessage) url.searchParams.set("message", errorMessage);
  if (paymentId) url.searchParams.set("paymentId", paymentId);
  res.redirect(302, url.toString());
}

/**
 * Optional: Verify payment from frontend (e.g. when user lands on success page).
 * Frontend can send txnid + orderId to double-check status.
 */
async function verifyPayment(req, res) {
  try {
    const { orderId, txnid } = req.body;
    const userId = req.user.userId;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Order.findOne({
      where: { id: orderId, userId },
      attributes: ["id", "status", "payuTxnId", "payuPaymentId"],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (txnid && order.payuTxnId !== txnid) {
      return res.status(400).json({ message: "Transaction ID mismatch.", status: "failed" });
    }

    res.status(200).json({
      message: order.status === "paid" ? "Payment verified." : "Payment pending.",
      status: order.status === "paid" ? "success" : "pending",
      orderId: order.id,
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ message: "Failed to verify payment.", error: error.message });
  }
}

module.exports = {
  createPayuPayment,
  payuSuccessCallback,
  payuFailureCallback,
  verifyPayment,
};
