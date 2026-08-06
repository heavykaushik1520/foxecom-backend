const { Op } = require("sequelize");
const { Order } = require("../models");
const { getPendingOrderCutoffDate } = require("../utils/pendingOrderHelper");

const LOG = "[PendingOrderExpiry]";
const INTERVAL_MS =
  Number(process.env.PENDING_ORDER_EXPIRY_INTERVAL_MS) || 15 * 60 * 1000;

let timer = null;
let running = false;

async function expireStalePendingOrders() {
  if (running) return;
  running = true;

  try {
    const cutoff = getPendingOrderCutoffDate();
    const stale = await Order.findAll({
      where: {
        status: "pending",
        createdAt: { [Op.lt]: cutoff },
      },
      attributes: ["id", "userId", "createdAt"],
      limit: 100,
    });

    if (stale.length === 0) return;

    const ids = stale.map((o) => o.id);
    const [updated] = await Order.update(
      {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: "payment_timeout",
        refundType: "none",
      },
      {
        where: {
          id: { [Op.in]: ids },
          status: "pending",
        },
      },
    );

    if (updated > 0) {
      console.log(`${LOG} Cancelled ${updated} expired pending order(s)`);
    }
  } catch (err) {
    console.error(`${LOG} Job failed:`, err.message);
  } finally {
    running = false;
  }
}

function startPendingOrderExpiryJob() {
  if (timer) return;
  expireStalePendingOrders().catch(() => {});
  timer = setInterval(() => {
    expireStalePendingOrders().catch(() => {});
  }, INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`${LOG} Started (interval ${INTERVAL_MS}ms)`);
}

function stopPendingOrderExpiryJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  expireStalePendingOrders,
  startPendingOrderExpiryJob,
  stopPendingOrderExpiryJob,
};
