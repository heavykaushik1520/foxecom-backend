// src/controllers/paymentController.js - PayU India via official NodeJS SDK
const { Order } = require("../models");
const payuConfig = require("../config/payu");
const { safeStatusUpdate } = require("../utils/orderStatusHelper");
const { fulfillOrder } = require("../services/orderFulfillmentService");
const {
  normalizePreferredPaymentMethod,
  isCodOrder,
} = require("../utils/paymentMethodHelper");
const { isPendingOrderExpired } = require("../utils/pendingOrderHelper");

function verifyPayuResponseHash(params) {
  const client = payuConfig.getPayuClient();
  return client.hasher.validateResponseHash(params);
}

function getExistingPayuMeta(order) {
  const raw = order?.payuResponse;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function mapPayuParamsToOrder(params, order = null) {
  const existingMeta = order ? getExistingPayuMeta(order) : {};
  return {
    payuTxnId: params.txnid || null,
    payuPaymentId: params.mihpayid || params.paymentId || null,
    paymentMode: params.mode || params.payment_mode || null,
    bankRefNo: params.bank_ref_num || params.bankrefno || null,
    payuStatus: params.status || null,
    payuError: params.error_Message || params.error || null,
    payuResponse: {
      ...existingMeta,
      txnid: params.txnid,
      mihpayid: params.mihpayid,
      mode: params.mode,
      bank_ref_num: params.bank_ref_num,
      status: params.status,
      error_Message: params.error_Message,
      udf1: params.udf1,
      udf2: params.udf2,
      udf3: params.udf3,
      udf4: params.udf4,
      udf5: params.udf5,
      key: params.key,
      amount: params.amount,
      productinfo: params.productinfo,
      firstname: params.firstname,
      email: params.email,
    },
  };
}

function isPayuStatusSuccess(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "success" || normalized === "successful";
}

function amountsMatch(orderAmount, paidAmount) {
  const expected = parseFloat(orderAmount);
  const received = parseFloat(paidAmount);
  if (Number.isNaN(expected) || Number.isNaN(received)) return true;
  return Math.abs(expected - received) <= 0.01;
}

function getOnlinePaymentBlockReason(order) {
  if (!order) return "Order not found.";
  if (isCodOrder(order)) {
    return "This order uses Cash on Delivery. Online payment is not required.";
  }
  if (order.status === "cancelled") {
    return "This order has been cancelled.";
  }
  if (order.status === "paid") return null;
  if (order.status !== "pending") {
    return `Order cannot accept payment in status "${order.status}".`;
  }
  if (isPendingOrderExpired(order)) {
    return "This order has expired. Please place a new order.";
  }
  return null;
}

function redirectToFrontend(res, status, orderId, errorMessage, paymentId) {
  if (res.headersSent) return;
  try {
    const baseUrl = (
      process.env.FRONTEND_URL || "http://localhost:5173"
    ).replace(/\/+$/, "");
    const path = status === "success" ? "/payment/success" : "/payment/failure";
    const queryParams = [];
    if (orderId)
      queryParams.push(`orderId=${encodeURIComponent(String(orderId))}`);
    if (errorMessage)
      queryParams.push(`message=${encodeURIComponent(String(errorMessage))}`);
    if (paymentId)
      queryParams.push(`paymentId=${encodeURIComponent(String(paymentId))}`);
    const queryString =
      queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
    res.redirect(302, `${baseUrl}${path}${queryString}`);
  } catch (error) {
    console.error("Critical error in redirectToFrontend:", error);
    if (!res.headersSent) {
      const baseUrl = (
        process.env.FRONTEND_URL || "http://localhost:5173"
      ).replace(/\/+$/, "");
      const path =
        status === "success" ? "/payment/success" : "/payment/failure";
      res.redirect(302, `${baseUrl}${path}`);
    }
  }
}

/**
 * Build PayU auto-submit form HTML for a pending online order.
 * @param {import('../models').Order} order
 */
async function buildPayuPaymentForOrder(order) {
  if (!order) {
    throw new Error("Order not found.");
  }
  if (isCodOrder(order)) {
    throw new Error("This order uses Cash on Delivery. Online payment is not required.");
  }
  if (order.status === "paid") {
    throw new Error("Order is already paid.");
  }
  if (order.status !== "pending") {
    throw new Error(`Order cannot accept payment in status "${order.status}".`);
  }
  if (isPendingOrderExpired(order)) {
    throw new Error("This order has expired. Please place a new order.");
  }

  const amount = parseFloat(order.totalAmount).toFixed(2);
  const txnid = `TXN${order.id}${Date.now()}`.substring(0, 25);
  const productinfo = `Order #${order.id}`;
  const firstname =
    (order.firstName || "").trim().substring(0, 50) || "Customer";
  const lastname =
    (order.lastName || "").trim().substring(0, 50) || firstname;
  const email = (order.emailAddress || "").trim();

  let phone = String(order.mobileNumber || "").replace(/\D/g, "");
  if (phone.length > 10) phone = phone.slice(-10);
  if (phone.length < 10) {
    throw new Error("Invalid mobile number.");
  }

  const baseUrl =
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  const surl = `${baseUrl}/api/payment/payu-success`;
  const furl = `${baseUrl}/api/payment/payu-failure`;

  const paymentParams = {
    txnid,
    amount,
    productinfo,
    firstname,
    lastname: lastname || firstname,
    email,
    phone,
    address1: (order.fullAddress || "").substring(0, 500),
    city: (order.townOrCity || "").substring(0, 50),
    state: (order.state || "").substring(0, 50),
    country: (order.country || "India").substring(0, 50),
    zipcode: String(order.pinCode || ""),
    surl,
    furl,
    udf1: String(order.id),
    udf2: "",
    udf3: "",
    udf4: "",
    udf5: "",
  };

  if (
    normalizePreferredPaymentMethod(order.preferredPaymentMethod) === "UPI"
  ) {
    paymentParams.mode = "UPI";
  }

  const payuClient = payuConfig.getPayuClient();
  const paymentFormHtml = payuClient.paymentInitiate(paymentParams);
  await order.update({ payuTxnId: txnid });

  return { paymentFormHtml, txnid, orderId: order.id };
}

async function createPayuPayment(req, res) {
  try {
    const { orderId } = req.body;
    const userId = req.user.userId;
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Order.findOne({
      where: { id: orderId, userId },
    });
    if (!order) return res.status(404).json({ message: "Order not found." });

    const result = await buildPayuPaymentForOrder(order);

    res.status(200).json({
      message: "PayU payment form created successfully.",
      orderId: result.orderId,
      paymentFormHtml: result.paymentFormHtml,
    });
  } catch (error) {
    console.error("Error creating PayU payment:", error);
    const status = error.message?.includes("not found") ? 404 : 400;
    res.status(status === 404 ? 404 : 400).json({
      message: error.message || "Failed to create payment.",
    });
  }
}

async function payuSuccessCallback(req, res) {
  if (res.headersSent) return;

  try {
    const params = { ...req.body, ...req.query };

    if (params.key && params.key !== payuConfig.key) {
      console.error("PayU Success Callback - Invalid merchant key");
      return redirectToFrontend(res, "failure", null, "Invalid merchant key.");
    }

    const orderId = params.udf1 ? parseInt(params.udf1, 10) : null;
    if (!orderId) {
      console.error("PayU Success Callback - Missing orderId (udf1)");
      return redirectToFrontend(
        res,
        "failure",
        null,
        "Order reference missing.",
      );
    }

    let order = await Order.findOne({ where: { id: orderId } });
    if (!order) {
      return redirectToFrontend(res, "failure", orderId, "Order not found.");
    }

    if (params.hash) {
      const hashValid = verifyPayuResponseHash(params);
      if (!hashValid) {
        console.error("PayU Success Callback - Hash verification failed");
        return redirectToFrontend(
          res,
          "failure",
          orderId,
          "Payment verification failed.",
        );
      }
    } else {
      return redirectToFrontend(
        res,
        "failure",
        orderId,
        "Verification hash missing.",
      );
    }

    const paymentBlockReason = getOnlinePaymentBlockReason(order);
    if (paymentBlockReason && order.status !== "paid") {
      return redirectToFrontend(res, "failure", orderId, paymentBlockReason);
    }

    const isSuccess = isPayuStatusSuccess(params.status);

    if (!isSuccess) {
      await order.update(mapPayuParamsToOrder(params, order));
      return redirectToFrontend(
        res,
        "failure",
        orderId,
        params.error_Message || "Payment failed.",
      );
    }

    if (order.status === "paid") {
      return redirectToFrontend(
        res,
        "success",
        order.id,
        null,
        order.payuPaymentId,
      );
    }

    if (
      order.payuTxnId &&
      params.txnid &&
      order.payuTxnId !== params.txnid
    ) {
      return redirectToFrontend(
        res,
        "failure",
        orderId,
        "Payment session mismatch. Please retry payment for this order.",
      );
    }

    if (!amountsMatch(order.totalAmount, params.amount)) {
      return redirectToFrontend(
        res,
        "failure",
        orderId,
        "Payment amount does not match order total.",
      );
    }

    const updateData = mapPayuParamsToOrder(params, order);
    await order.update(updateData);
    const statusUpdated = await safeStatusUpdate(order, "paid");

    if (!statusUpdated) {
      return redirectToFrontend(
        res,
        "failure",
        orderId,
        "Payment could not be confirmed for this order.",
      );
    }

    setImmediate(() => {
      fulfillOrder(order.id).catch((err) =>
        console.error("Post-payment fulfillment failed:", err.message),
      );
    });

    redirectToFrontend(
      res,
      "success",
      order.id,
      null,
      updateData.payuPaymentId,
    );
  } catch (error) {
    console.error("Critical Error in PayU Callback:", error);
    redirectToFrontend(
      res,
      "failure",
      null,
      "Internal server error during verification.",
    );
  }
}

async function payuFailureCallback(req, res) {
  try {
    const params = { ...req.body, ...req.query };

    if (params.key && params.key !== payuConfig.key) {
      console.error("PayU Failure Callback - Invalid merchant key");
      return redirectToFrontend(res, "failure", null, "Invalid merchant key.");
    }

    const orderId = params.udf1 ? parseInt(params.udf1, 10) : null;

    if (orderId && params.hash) {
      const hashValid = verifyPayuResponseHash(params);
      if (!hashValid) {
        console.error("PayU Failure Callback - Hash verification failed");
        return redirectToFrontend(
          res,
          "failure",
          orderId,
          "Payment verification failed.",
        );
      }
    }

    if (orderId) {
      const order = await Order.findOne({
        where: { id: orderId },
        attributes: [
          "id",
          "payuTxnId",
          "payuPaymentId",
          "paymentMode",
          "bankRefNo",
          "payuStatus",
          "payuError",
          "payuResponse",
        ],
      });
      if (order) {
        const update = mapPayuParamsToOrder(params, order);
        await order.update(update);
      }
    }

    const errorMsg =
      params.error_Message ||
      params.error ||
      params.message ||
      "Payment failed.";
    redirectToFrontend(res, "failure", orderId, errorMsg);
  } catch (error) {
    console.error("Error in PayU failure callback:", error);
    redirectToFrontend(res, "failure", null, "Payment failed.");
  }
}

async function verifyPayment(req, res) {
  try {
    const { orderId, txnid } = req.body;
    const userId = req.user.userId;
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    const order = await Order.findOne({
      where: { id: orderId, userId },
      attributes: [
        "id",
        "status",
        "preferredPaymentMethod",
        "paymentMode",
        "totalAmount",
        "payuTxnId",
        "payuPaymentId",
        "payuResponse",
        "bankRefNo",
        "payuStatus",
        "payuError",
        "createdAt",
      ],
    });

    if (!order) return res.status(404).json({ message: "Order not found." });

    if (order.status === "paid") {
      return res.status(200).json({
        message: "Payment verified.",
        status: "success",
        orderId: order.id,
      });
    }

    const paymentBlockReason = getOnlinePaymentBlockReason(order);
    if (paymentBlockReason) {
      const statusCode = isPendingOrderExpired(order) ? 410 : 400;
      return res.status(statusCode).json({
        message: paymentBlockReason,
        status: "failed",
        expired: isPendingOrderExpired(order),
        orderId: order.id,
      });
    }

    const txnIdToVerify = txnid || order.payuTxnId;
    if (!txnIdToVerify) {
      return res.status(200).json({
        message: "No transaction ID to verify.",
        status: order.status === "paid" ? "success" : "pending",
        orderId: order.id,
      });
    }

    if (txnid && order.payuTxnId && order.payuTxnId !== txnid) {
      return res
        .status(400)
        .json({ message: "Transaction ID mismatch.", status: "failed" });
    }

    const payuClient = payuConfig.getPayuClient();
    const verifyResult = await payuClient.verifyPayment(txnIdToVerify);

    const payuStatus =
      verifyResult && (verifyResult.status || verifyResult.transaction_status);
    const isSuccess = isPayuStatusSuccess(payuStatus);

    if (isSuccess) {
      const paidAmount =
        verifyResult?.amount ||
        verifyResult?.transaction_amount ||
        verifyResult?.amt;
      if (!amountsMatch(order.totalAmount, paidAmount)) {
        return res.status(400).json({
          message: "Payment amount does not match order total.",
          status: "failed",
          orderId: order.id,
        });
      }

      const existingMeta = getExistingPayuMeta(order);
      await order.update({
        payuPaymentId:
          verifyResult.mihpayid ||
          verifyResult.payment_id ||
          order.payuPaymentId,
        payuStatus: payuStatus || "success",
        paymentMode:
          verifyResult.mode || verifyResult.payment_mode || order.paymentMode,
        bankRefNo:
          verifyResult.bank_ref_num ||
          verifyResult.bankrefno ||
          order.bankRefNo,
        payuResponse: {
          ...existingMeta,
          verifyPayment: verifyResult,
        },
      });
      const updated = await safeStatusUpdate(order, "paid");
      if (updated) {
        await order.reload();
        setImmediate(() => {
          fulfillOrder(order.id).catch((err) =>
            console.error("Verify-payment fulfillment failed:", err.message),
          );
        });
      }
    }

    await order.reload();

    return res.status(200).json({
      message:
        order.status === "paid" ? "Payment verified." : "Payment pending.",
      status: order.status === "paid" ? "success" : "pending",
      orderId: order.id,
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res
      .status(500)
      .json({ message: "Failed to verify payment.", error: error.message });
  }
}

module.exports = {
  createPayuPayment,
  payuSuccessCallback,
  payuFailureCallback,
  verifyPayment,
  buildPayuPaymentForOrder,
  redirectToFrontend,
};
