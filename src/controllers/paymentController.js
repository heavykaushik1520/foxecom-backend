// src/controllers/paymentController.js - PayU India via official NodeJS SDK
const { Order, OrderItem, Product } = require("../models");
const payuConfig = require("../config/payu");
const { sendOrderEmails } = require("../utils/sendOrderEmails");
const { sendShipmentEmailToCustomer } = require("../utils/sendOrderEmails");
const { createOrderShipment } = require("../services/delhivery/orderShipment");
const { getDelhiveryConfig } = require("../services/delhivery/delhiveryApi");

/**
 * Verify PayU response hash (callback). Never skip in production or test.
 * Uses same algorithm as SDK reverseHasher: salt|status||||||udf5|...|key
 */
function verifyPayuResponseHash(params) {
  const client = payuConfig.getPayuClient();
  return client.hasher.validateResponseHash(params);
}

/**
 * Persist full PayU callback payload to order (for success or failure).
 */
function mapPayuParamsToOrder(params) {
  return {
    payuTxnId: params.txnid || null,
    payuPaymentId: params.mihpayid || params.paymentId || null,
    paymentMode: params.mode || params.payment_mode || null,
    bankRefNo: params.bank_ref_num || params.bankrefno || null,
    payuStatus: params.status || null,
    payuError: params.error_Message || params.error || null,
    payuResponse: {
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
      ],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.status === "paid") {
      return res.status(400).json({ message: "Order is already paid." });
    }

    const amount = parseFloat(order.totalAmount).toFixed(2);
    const txnid = `TXN${order.id}${Date.now()}`.substring(0, 25);
    const productinfo = `Order #${order.id}`;
    const firstname = (order.firstName || "").trim().substring(0, 50) || "Customer";
    const lastname = (order.lastName || "").trim().substring(0, 50) || firstname;
    const email = (order.emailAddress || "").trim();

    let phone = String(order.mobileNumber || "").replace(/\D/g, "");
    if (phone.length > 10) phone = phone.slice(-10);
    if (phone.length < 10) {
      return res.status(400).json({ message: "Invalid mobile number." });
    }

    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
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

    const payuClient = payuConfig.getPayuClient();
    const paymentFormHtml = payuClient.paymentInitiate(paymentParams);

    order.payuTxnId = txnid;
    await order.save();

    res.status(200).json({
      message: "PayU payment form created successfully.",
      orderId: order.id,
      paymentFormHtml,
    });
  } catch (error) {
    console.error("Error creating PayU payment:", error);
    res.status(500).json({
      message: "Failed to create payment.",
      error: error.message,
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
      return redirectToFrontend(res, "failure", null, "Order not found.");
    }

    let order = await Order.findOne({
      where: { id: orderId },
      attributes: [
        "id", "userId", "totalAmount", "status", "payuTxnId", "payuPaymentId",
        "paymentMode", "bankRefNo", "payuStatus", "payuError", "payuResponse",
      ],
    });

    if (!order) {
      console.error("PayU Success Callback - Order not found:", orderId);
      return redirectToFrontend(res, "failure", orderId, "Order not found.");
    }

    if (params.txnid && order.payuTxnId && order.payuTxnId !== params.txnid) {
      console.warn("PayU Success Callback - Transaction ID mismatch");
      return redirectToFrontend(res, "failure", orderId, "Transaction ID mismatch.");
    }

    // Strict hash verification: never skip
    if (params.hash) {
      const hashValid = verifyPayuResponseHash(params);
      if (!hashValid) {
        console.error("PayU Success Callback - Hash verification failed");
        return redirectToFrontend(res, "failure", orderId, "Payment verification failed.");
      }
    } else {
      console.warn("PayU Success Callback - No hash in response");
      return redirectToFrontend(res, "failure", orderId, "Payment verification failed.");
    }

    const status = (params.status || "").toLowerCase();
    const isSuccess =
      status === "success" ||
      status === "successful" ||
      !!params.mihpayid ||
      !!params.paymentId;

    if (!isSuccess && params.error_Message) {
      const update = mapPayuParamsToOrder(params);
      await order.update(update);
      return redirectToFrontend(
        res,
        "failure",
        orderId,
        params.error_Message || "Payment failed."
      );
    }

    if (order.status === "paid") {
      return redirectToFrontend(res, "success", order.id, null, order.payuPaymentId);
    }

    const update = {
      ...mapPayuParamsToOrder(params),
      status: "paid",
    };
    await order.update(update);

    setImmediate(async () => {
      try {
        const completeOrder = await Order.findByPk(order.id, {
          attributes: [
            "id", "userId", "totalAmount", "firstName", "lastName",
            "mobileNumber", "emailAddress", "fullAddress", "townOrCity",
            "country", "state", "pinCode", "status",
            "payuTxnId", "payuPaymentId", "paymentMode", "bankRefNo", "payuStatus", "payuError",
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

        const delhiveryConfig = getDelhiveryConfig();
        if (delhiveryConfig.isConfigured) {
          console.log("[Delhivery] Creating shipment for order", order.id, "pinCode:", completeOrder.pinCode);
          const shipResult = await createOrderShipment(completeOrder, { fetchWaybill: false });
          if (shipResult.success) {
            try {
              await Order.update(
                {
                  shipmentId: shipResult.shipmentId,
                  awbCode: shipResult.awb || shipResult.waybill,
                  shippingLabelUrl: shipResult.labelUrl,
                  shipmentStatus: "created",
                },
                { where: { id: order.id } }
              );
              console.log("[Delhivery] Auto shipment created for order", order.id, "AWB:", shipResult.waybill);
              // Send shipment email to customer (safe to call even if AWB existed)
              try {
                const trackBase = process.env.FRONTEND_URL || "";
                const trackUrl = trackBase
                  ? `${trackBase.replace(/\/+$/, "")}/order/${order.id}/track`
                  : null;
                await sendShipmentEmailToCustomer({
                  order: completeOrder.toJSON ? completeOrder.toJSON() : completeOrder,
                  awb: shipResult.awb || shipResult.waybill,
                  labelUrl: shipResult.labelUrl || null,
                  trackUrl,
                });
              } catch (shipMailErr) {
                console.error("[Delhivery] Shipment email send failed (auto create)", shipMailErr.message);
              }
            } catch (updateErr) {
              console.error("[Delhivery] Shipment created at Delhivery but DB update failed for order", order.id, updateErr.message);
            }
          } else {
            console.warn("[Delhivery] Auto shipment FAILED for order", order.id, "reason:", shipResult.error);
          }
        } else {
          console.warn("[Delhivery] Skipping auto shipment: not configured. Set in .env: DELHIVERY_API_KEY, DELHIVERY_BASE_URL, DELHIVERY_PICKUP_LOCATION or DELHIVERY_WAREHOUSE_CODE");
        }
      } catch (emailErr) {
        console.error("[Delhivery] Error in post-payment job (emails/shipment):", emailErr.message);
      }
    });

    redirectToFrontend(res, "success", order.id, null, update.payuPaymentId || order.payuPaymentId);
  } catch (error) {
    console.error("Error in PayU success callback:", error);
    const params = { ...req.body, ...req.query };
    const orderId = params.udf1 ? parseInt(params.udf1, 10) : null;
    redirectToFrontend(res, "failure", orderId, error.message || "Verification failed.");
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
        return redirectToFrontend(res, "failure", orderId, "Payment verification failed.");
      }
    }

    if (orderId) {
      const order = await Order.findOne({
        where: { id: orderId },
        attributes: ["id", "payuTxnId", "payuPaymentId", "paymentMode", "bankRefNo", "payuStatus", "payuError", "payuResponse"],
      });
      if (order) {
        const update = mapPayuParamsToOrder(params);
        await order.update(update);
      }
    }

    const errorMsg = params.error_Message || params.error || params.message || "Payment failed.";
    redirectToFrontend(res, "failure", orderId, errorMsg);
  } catch (error) {
    console.error("Error in PayU failure callback:", error);
    redirectToFrontend(res, "failure", null, "Payment failed.");
  }
}

function redirectToFrontend(res, status, orderId, errorMessage, paymentId) {
  if (res.headersSent) return;

  try {
    // Strip trailing slash so we never get double slash (e.g. https://site.com/ + /payment/success)
    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
    const path = status === "success" ? "/payment/success" : "/payment/failure";
    const params = [];
    if (orderId) params.push(`orderId=${encodeURIComponent(String(orderId))}`);
    if (errorMessage) params.push(`message=${encodeURIComponent(String(errorMessage))}`);
    if (paymentId) params.push(`paymentId=${encodeURIComponent(String(paymentId))}`);
    const queryString = params.length > 0 ? `?${params.join("&")}` : "";
    res.redirect(302, `${baseUrl}${path}${queryString}`);
  } catch (error) {
    console.error("Critical error in redirectToFrontend:", error);
    if (!res.headersSent) {
      const baseUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
      const path = status === "success" ? "/payment/success" : "/payment/failure";
      res.redirect(302, `${baseUrl}${path}`);
    }
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
        "id", "status", "payuTxnId", "payuPaymentId",
        "paymentMode", "bankRefNo", "payuStatus", "payuError",
      ],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
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
      return res.status(400).json({ message: "Transaction ID mismatch.", status: "failed" });
    }

    const payuClient = payuConfig.getPayuClient();
    const verifyResult = await payuClient.verifyPayment(txnIdToVerify);

    const payuStatus = verifyResult && (verifyResult.status || verifyResult.transaction_status);
    const isSuccess =
      payuStatus === "success" ||
      payuStatus === "successful" ||
      (verifyResult && (verifyResult.mihpayid || verifyResult.payment_id));

    if (isSuccess && order.status !== "paid") {
      await order.update({
        status: "paid",
        payuPaymentId: verifyResult.mihpayid || verifyResult.payment_id || order.payuPaymentId,
        payuStatus: payuStatus || "success",
        paymentMode: verifyResult.mode || verifyResult.payment_mode || order.paymentMode,
        bankRefNo: verifyResult.bank_ref_num || verifyResult.bankrefno || order.bankRefNo,
      });
    }

    return res.status(200).json({
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
