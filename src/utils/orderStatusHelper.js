const STATUS_RANK = {
  pending:    1,
  paid:       2,
  processing: 3,
  shipped:    4,
  delivered:  5,
  cancelled:  0,
};

function canTransitionStatus(currentStatus, newStatus) {
  if (currentStatus === "cancelled") return false;
  if (currentStatus === "delivered") return false;
  const currentRank = STATUS_RANK[currentStatus] ?? 0;
  const newRank = STATUS_RANK[newStatus] ?? 0;
  return newRank > currentRank;
}

async function safeStatusUpdate(order, newStatus, extraFields = {}) {
  if (!canTransitionStatus(order.status, newStatus)) {
    console.log(
      `[OrderStatusGuard] Skipped: ${order.status} → ${newStatus} not allowed for order ${order.id}`
    );
    return false;
  }
  await order.update({ status: newStatus, ...extraFields });
  return true;
}

module.exports = { canTransitionStatus, safeStatusUpdate, STATUS_RANK };