/**
 * Post-confirmation order fulfillment: clear cart, ship, emails, review reminders.
 * Called after PayU success (paid) or COD confirm (processing).
 */
const { Order, OrderItem, Product, Cart, CartItem, sequelize } = require("../models");
const { createOrderShipment } = require("./delhivery/orderShipment");
const { getDelhiveryConfig } = require("./delhivery/delhiveryApi");
const {
  sendOrderEmails,
  sendShipmentEmailToCustomer,
} = require("../utils/sendOrderEmails");
const {
  createReviewRemindersForDeliveredOrder,
} = require("./reviewReminderService");

const LOG = "[OrderFulfillment]";

function getFulfillmentMeta(order) {
  const raw = order?.payuResponse;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function clearCartForUser(userId) {
  try {
    const cart = await Cart.findOne({ where: { userId } });
    if (!cart) return;
    await CartItem.destroy({ where: { cartId: cart.id } });
  } catch (err) {
    console.error(`${LOG} Cart clear failed for user ${userId}:`, err.message);
  }
}

async function restoreCartItemsForUser(userId, orderItems) {
  const cart =
    (await Cart.findOne({ where: { userId } })) ||
    (await Cart.create({ userId }));

  const restored = [];
  const skipped = [];

  for (const item of orderItems) {
    const productId = item.productId;
    const selectedModelId = item.selectedModelId ?? null;
    const quantity = item.quantity || 1;

    const product = await Product.findByPk(productId);
    if (!product) {
      skipped.push({ productId, reason: "Product not found" });
      continue;
    }

    const where = {
      cartId: cart.id,
      productId,
      selectedModelId,
    };

    const existing = await CartItem.findOne({ where });
    if (existing) {
      await existing.update({ quantity: existing.quantity + quantity });
    } else {
      await CartItem.create({ ...where, quantity });
    }
    restored.push({ productId, quantity, selectedModelId });
  }

  return { restored, skipped };
}

/**
 * @param {number} orderId
 * @param {{ clearCart?: boolean }} [options]
 */
async function fulfillOrder(orderId, options = {}) {
  const clearCart = options.clearCart !== false;

  const claimResult = await sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    const fulfillable = ["paid", "processing"];
    if (!fulfillable.includes(order.status)) {
      return {
        success: false,
        error: `Order status "${order.status}" is not fulfillable`,
      };
    }

    const fulfillmentMeta = getFulfillmentMeta(order);
    if (fulfillmentMeta.fulfillmentDone) {
      return { success: true, duplicate: true, userId: order.userId };
    }

    await order.update(
      {
        payuResponse: {
          ...fulfillmentMeta,
          fulfillmentDone: true,
          fulfillmentAt: new Date().toISOString(),
        },
      },
      { transaction },
    );

    return {
      success: true,
      duplicate: false,
      userId: order.userId,
      alreadyShipped: Boolean(order.awbCode || order.shipmentId),
      awbCode: order.awbCode,
    };
  });

  if (!claimResult.success) {
    return claimResult;
  }
  if (claimResult.duplicate) {
    return { success: true, duplicate: true };
  }

  if (clearCart) {
    await clearCartForUser(claimResult.userId);
  }

  const order = await Order.findByPk(orderId, {
    include: [
      {
        model: OrderItem,
        as: "orderItems",
        include: [{ model: Product, as: "product" }],
      },
    ],
  });

  if (!order) {
    return { success: false, error: "Order not found after claim" };
  }

  const alreadyShipped = claimResult.alreadyShipped;
  let shipResult = null;

  if (!alreadyShipped && getDelhiveryConfig().isConfigured) {
    shipResult = await createOrderShipment(order, { fetchWaybill: false });
    if (shipResult.success) {
      await order.update({
        shipmentId: shipResult.shipmentId,
        awbCode: shipResult.awb || shipResult.waybill,
        shipmentStatus: "created",
      });
      order.awbCode = shipResult.awb || shipResult.waybill;
    } else {
      console.error(
        `${LOG} Shipment creation failed for order ${orderId}:`,
        shipResult.error,
      );
    }
  }

  const completeOrder = await Order.findByPk(orderId, {
    include: [
      {
        model: OrderItem,
        as: "orderItems",
        include: [{ model: Product, as: "product" }],
      },
    ],
  });

  await sendOrderEmails(completeOrder.toJSON(), completeOrder.orderItems).catch(
    (err) => console.error(`${LOG} Order email error:`, err.message),
  );

  try {
    const reminderResult = await createReviewRemindersForDeliveredOrder({
      orderId: completeOrder.id,
      deliveredAt: new Date(),
    });
    console.log(
      `${LOG} Scheduled ${reminderResult.created} review reminders for order ${orderId}`,
    );
  } catch (revErr) {
    console.error(`${LOG} Review reminder failed:`, revErr.message);
  }

  const awb = completeOrder.awbCode || order.awbCode;
  if (awb && (shipResult?.success || alreadyShipped)) {
    const trackBase = process.env.FRONTEND_URL || "";
    const trackUrl = trackBase
      ? `${trackBase.replace(/\/+$/, "")}/order/${orderId}/track`
      : null;
    await sendShipmentEmailToCustomer({
      order: completeOrder.toJSON(),
      awb,
      trackUrl,
    }).catch((err) =>
      console.error(`${LOG} Shipment email error:`, err.message),
    );
  }

  return { success: true, shipResult, alreadyShipped };
}

module.exports = {
  fulfillOrder,
  clearCartForUser,
  restoreCartItemsForUser,
};
