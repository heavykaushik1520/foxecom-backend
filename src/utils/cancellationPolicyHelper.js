/**
 * Cancellation Policy Helper
 * All three business rules live here — change policy in ONE place.
 *
 * Rule 1: Customer can cancel within 24h if order is NOT yet dispatched.
 * Rule 2: Same as Rule 1 but shipment is manifested → also call Delhivery cancel API.
 * Rule 3: Cancel after 24h OR after dispatch → partial refund (minus GST + courier).
 */

const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours — change here to adjust

const DELHIVERY_CANCELLABLE_STATUSES = new Set([
  "manifested",
  "in_transit",
  "pending",
  "created",
  "not_created",
]);

const DISPATCHED_BEYOND_RECALL = new Set([
  "picked_up",
  "out_for_delivery",
  "delivered",
]);

const PHYSICALLY_DISPATCHED = new Set([
  "picked_up",
  "in_transit",
  "out_for_delivery",
]);

/**
 * Determine which cancellation rule applies to this order right now.
 *
 * @param {object} order - Sequelize order instance or plain object
 * @returns {{
 *   rule: "1"|"2"|"3"|"blocked",
 *   canCancel: boolean,
 *   isWithin24h: boolean,
 *   isDispatched: boolean,
 *   isManifested: boolean,
 *   reason: string,       -- human-readable reason for the decision
 *   refundType: "full"|"partial"|"none"
 * }}
 */
function evaluateCancellationPolicy(order) {
  const now = Date.now();
  const orderAge = now - new Date(order.createdAt).getTime();
  const isWithin24h = orderAge <= CANCEL_WINDOW_MS;

  const shipStatus = String(order.shipmentStatus || "")
    .toLowerCase()
    .replace(/\s+/g, "_");

  const isDelhiveryCancellable =
    Boolean(order.awbCode) && DELHIVERY_CANCELLABLE_STATUSES.has(shipStatus);

  const isBeyondRecall = DISPATCHED_BEYOND_RECALL.has(shipStatus);

  const isPhysicallyDispatched = PHYSICALLY_DISPATCHED.has(shipStatus);

  if (order.status === "cancelled") {
    return {
      rule: "blocked", canCancel: false,
      reason: "Order is already cancelled.",
      refundType: "none",
      isDelhiveryCancellable, isBeyondRecall, isWithin24h,
    };
  }

  if (order.status === "delivered") {
    return {
      rule: "blocked", canCancel: false,
      reason: "Delivered orders cannot be cancelled.",
      refundType: "none",
      isDelhiveryCancellable, isBeyondRecall, isWithin24h,
    };
  }

  if (isBeyondRecall) {
    return {
      rule: "blocked", canCancel: false,
      reason: "Shipment is out for delivery and cannot be cancelled.",
      refundType: "none",
      isDelhiveryCancellable, isBeyondRecall, isWithin24h,
    };
  }

  if (isPhysicallyDispatched) {
    return {
      rule: "3", canCancel: true,
      reason: "Package has been dispatched. Partial refund applies — GST and courier charges will be deducted.",
      refundType: "partial",
      isDelhiveryCancellable, isBeyondRecall, isWithin24h,
    };
  }

  if (isWithin24h) {
    const rule = isDelhiveryCancellable ? "2" : "1";
    return {
      rule, canCancel: true,
      reason: rule === "2"
        ? "Within 24h, label exists, courier API will be called."
        : "Within 24-hour cancellation window.",
      refundType: "full",
      isDelhiveryCancellable, isBeyondRecall, isWithin24h,
    };
  }

  return {
    rule: "3", canCancel: true,
    reason: "Cancellation window has expired. Partial refund applies.",
    refundType: "partial",
    isDelhiveryCancellable, isBeyondRecall, isWithin24h,
  };
}

/**
 * Human-readable cancel reason code — stored in DB for reporting.
 * @param {"1"|"2"|"3"} rule
 * @returns {string}
 */
function getCancelReasonCode(rule) {
  const map = {
    "1": "within_24h_pre_manifest",
    "2": "within_24h_manifested",
    "3": "partial_refund_eligible",
  };
  return map[rule] || "unknown";
}

/**
 * Remaining time in the cancellation window (for frontend display).
 * @param {Date|string} createdAt
 * @returns {{ hoursLeft: number, minutesLeft: number, expired: boolean }}
 */
function getCancellationWindowRemaining(createdAt) {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const remaining = CANCEL_WINDOW_MS - elapsed;
  if (remaining <= 0) return { hoursLeft: 0, minutesLeft: 0, expired: true };
  const hoursLeft = Math.floor(remaining / (60 * 60 * 1000));
  const minutesLeft = Math.floor((remaining % (60 * 60 * 1000)) / 60000);
  return { hoursLeft, minutesLeft, expired: false };
}

module.exports = {
  evaluateCancellationPolicy,
  getCancelReasonCode,
  getCancellationWindowRemaining,
  CANCEL_WINDOW_MS,
  DELHIVERY_CANCELLABLE_STATUSES,
  DISPATCHED_BEYOND_RECALL,
  PHYSICALLY_DISPATCHED,
};
