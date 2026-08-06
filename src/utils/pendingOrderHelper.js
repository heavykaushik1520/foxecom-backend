const { Op } = require("sequelize");
const { getPendingOrderTtlMinutes } = require("../config/codConfig");

function getPendingOrderTtlMs() {
  return getPendingOrderTtlMinutes() * 60 * 1000;
}

function getPendingOrderCutoffDate() {
  return new Date(Date.now() - getPendingOrderTtlMs());
}

function isPendingOrderExpired(order) {
  if (!order || order.status !== "pending") return false;
  const created = new Date(order.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created > getPendingOrderTtlMs();
}

function pendingOrderWhere(userId) {
  return {
    userId,
    status: "pending",
    createdAt: { [Op.gte]: getPendingOrderCutoffDate() },
  };
}

module.exports = {
  getPendingOrderTtlMs,
  getPendingOrderCutoffDate,
  isPendingOrderExpired,
  pendingOrderWhere,
  getPendingOrderTtlMinutes,
};
