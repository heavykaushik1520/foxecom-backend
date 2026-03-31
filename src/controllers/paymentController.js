// src/controllers/paymentController.js - PayU India via official NodeJS SDK
const { Order, OrderItem, Product } = require("../models");
const payuConfig = require("../config/payu");
const { sendOrderEmails } = require("../utils/sendOrderEmails");
const { sendShipmentEmailToCustomer } = require("../utils/sendOrderEmails");
const { createOrderShipment } = require("../services/delhivery/orderShipment");
const { getDelhiveryConfig } = require("../services/delhivery/delhiveryApi")
const { createReviewRemindersForDeliveredOrder } = require("../services/reviewReminderService");

function verifyPayuResponseHash(params) {
  const client = payuConfig.getPayuClient();
  return client.hasher.validateResponseHash(params);
}

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
    if (!orderId) return res.status(400).json({ message: "Order ID is required." });
    const order = await Order.findOne({
      where: { id: orderId, userId },
      attributes: [
        "id", "userId", "totalAmount", "subtotal", "discountAmount", "upiDiscountPercent",
        "preferredPaymentMethod", "firstName", "lastName",
        "mobileNumber", "emailAddress", "fullAddress", "townOrCity",
        "country", "state", "pinCode", "status", "payuTxnId", "payuPaymentId",
      ],
    });
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.status === "paid") return res.status(400).json({ message: "Order is already paid." });

    const amount = parseFloat(order.totalAmount).toFixed(2);
    const txnid = `TXN${order.id}${Date.now()}`.substring(0, 25);
    const productinfo = `Order #${order.id}`;
    const firstname = (order.firstName || "").trim().substring(0, 50) || "Customer";
    const lastname = (order.lastName || "").trim().substring(0, 50) || firstname;
    const email = (order.emailAddress || "").trim();

    let phone = String(order.mobileNumber || "").replace(/\D/g, "");
    if (phone.length > 10) phone = phone.slice(-10);
    if (phone.length < 10) return res.status(400).json({ message: "Invalid mobile number." });

    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const surl = `${baseUrl}/api/payment/payu-success`;
    const furl = `${baseUrl}/api/payment/payu-failure`;

    const paymentParams = {
      txnid, amount, productinfo, firstname,
      lastname: lastname || firstname,
      email, phone,
      address1: (order.fullAddress || "").substring(0, 500),
      city: (order.townOrCity || "").substring(0, 50),
      state: (order.state || "").substring(0, 50),
      country: (order.country || "India").substring(0, 50),
      zipcode: String(order.pinCode || ""),
      surl, furl,
      udf1: String(order.id),
      udf2: "", udf3: "", udf4: "", udf5: "",
    };

    if (String(order.preferredPaymentMethod || "").toUpperCase() === "UPI") {
      paymentParams.mode = "UPI";
    }

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
    res.status(500).json({ message: "Failed to create payment.", error: error.message });
  }
}

async function payuSuccessCallback(req, res) {
  if (res.headersSent) return;

  try {
    const params = { ...req.body, ...req.query };

    // 1. Basic Key Validation
    if (params.key && params.key !== payuConfig.key) {
      console.error("PayU Success Callback - Invalid merchant key");
      return redirectToFrontend(res, "failure", null, "Invalid merchant key.");
    }

    // 2. Extract Order ID from UDF1
    const orderId = params.udf1 ? parseInt(params.udf1, 10) : null;
    if (!orderId) {
      console.error("PayU Success Callback - Missing orderId (udf1)");
      return redirectToFrontend(res, "failure", null, "Order reference missing.");
    }

    let order = await Order.findOne({ where: { id: orderId } });
    if (!order) return redirectToFrontend(res, "failure", orderId, "Order not found.");

    // 3. Hash Verification (Security)
    if (params.hash) {
      const hashValid = verifyPayuResponseHash(params);
      if (!hashValid) {
        console.error("PayU Success Callback - Hash verification failed");
        return redirectToFrontend(res, "failure", orderId, "Payment verification failed.");
      }
    } else {
      return redirectToFrontend(res, "failure", orderId, "Verification hash missing.");
    }

    // 4. Determine Success
    const status = (params.status || "").toLowerCase();
    const isSuccess = status === "success" || status === "successful" || !!params.mihpayid;

    if (!isSuccess) {
      await order.update(mapPayuParamsToOrder(params));
      return redirectToFrontend(res, "failure", orderId, params.error_Message || "Payment failed.");
    }

    // Prevent double processing if already paid
    if (order.status === "paid") {
      return redirectToFrontend(res, "success", order.id, null, order.payuPaymentId);
    }

    // 5. Update Order Status to PAID
    const updateData = { ...mapPayuParamsToOrder(params), status: "paid" };
    await order.update(updateData);

    // 6. BACKGROUND JOBS (Non-blocking)
    setImmediate(async () => {
      try {
        // Fetch complete order with items for emails and shipment
        const completeOrder = await Order.findByPk(order.id, {
          include: [{
            model: OrderItem,
            as: "orderItems",
            include: [{ model: Product, as: "product" }]
          }]
        });

        // A. Delhivery Shipment Creation
        let shipResult = null;
        if (getDelhiveryConfig().isConfigured) {
          shipResult = await createOrderShipment(completeOrder, { fetchWaybill: false });
          if (shipResult.success) {
            await order.update({
              shipmentId: shipResult.shipmentId,
              awbCode: shipResult.awb || shipResult.waybill,
              shipmentStatus: "created"
            });
            completeOrder.awbCode = shipResult.awb || shipResult.waybill;
          }
        }

        // B. Send Order Confirmation Emails (Customer + Admin)
        await sendOrderEmails(completeOrder.toJSON(), completeOrder.orderItems)
          .catch(err => console.error("Order Email Error:", err.message));

        // C. TRIGGER REVIEW REMINDERS (The Fix)
        // This creates the entry in ReviewReminders table for the Cron to pick up
        try {
          const reminderResult = await createReviewRemindersForDeliveredOrder({
            orderId: completeOrder.id,
            deliveredAt: new Date(), // Baseline for the delay timer
          });
          console.log(`[ReviewReminder] Scheduled ${reminderResult.created} items for order ${completeOrder.id}`);
        } catch (revErr) {
          console.error("[ReviewReminder] Failed to schedule:", revErr.message);
        }

        // D. Send Shipment Email (If AWB exists)
        if (shipResult?.success) {
          const trackBase = process.env.FRONTEND_URL || "";
          const trackUrl = trackBase ? `${trackBase.replace(/\/+$/, "")}/order/${order.id}/track` : null;
          await sendShipmentEmailToCustomer({
            order: completeOrder.toJSON(),
            awb: completeOrder.awbCode,
            trackUrl
          }).catch(err => console.error("Shipment Email Error:", err.message));
        }

      } catch (bgError) {
        console.error("Post-payment background task failed:", bgError.message);
      }
    });

    // Final Redirect to Frontend
    redirectToFrontend(res, "success", order.id, null, updateData.payuPaymentId);

  } catch (error) {
    console.error("Critical Error in PayU Callback:", error);
    redirectToFrontend(res, "failure", null, "Internal server error during verification.");
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
    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
    const path = status === "success" ? "/payment/success" : "/payment/failure";
    const queryParams = [];
    if (orderId) queryParams.push(`orderId=${encodeURIComponent(String(orderId))}`);
    if (errorMessage) queryParams.push(`message=${encodeURIComponent(String(errorMessage))}`);
    if (paymentId) queryParams.push(`paymentId=${encodeURIComponent(String(paymentId))}`);
    const queryString = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
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
    if (!orderId) return res.status(400).json({ message: "Order ID is required." });

    const order = await Order.findOne({
      where: { id: orderId, userId },
      attributes: ["id", "status", "payuTxnId", "payuPaymentId", "paymentMode", "bankRefNo", "payuStatus", "payuError"],
    });

    if (!order) return res.status(404).json({ message: "Order not found." });

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
      payuStatus === "success" || payuStatus === "successful" ||
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
