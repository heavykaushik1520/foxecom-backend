/**
 * Delivery Stage Helper
 *
 * Maps raw Delhivery status codes → rich stage objects for the frontend.
 * Add new stages here without touching the controller or frontend logic.
 *
 * Stage object shape:
 * {
 *   code: string,          -- internal code
 *   label: string,         -- display label for customer
 *   description: string,   -- friendly description
 *   step: number,          -- 1-7 for progress bar
 *   isTerminal: boolean,   -- true if order journey is complete
 *   isCancellable: boolean -- can the customer still cancel?
 * }
 */

const DELIVERY_STAGES = {
  // ── Pre-shipment ──────────────────────────────────────────────────────
  order_placed: {
    code: "order_placed",
    label: "Order placed",
    description: "Your order has been received and is being prepared.",
    step: 1,
    isTerminal: false,
    isCancellable: true,
  },
  payment_confirmed: {
    code: "payment_confirmed",
    label: "Payment confirmed",
    description: "Your payment was successful. We're preparing your shipment.",
    step: 2,
    isTerminal: false,
    isCancellable: true,
  },
  // ── Delhivery statuses ────────────────────────────────────────────────
  manifested: {
    code: "manifested",
    label: "Label created",
    description: "Shipping label generated. Awaiting courier pickup.",
    step: 3,
    isTerminal: false,
    isCancellable: true, // still cancellable via Delhivery API
  },
  picked_up: {
    code: "picked_up",
    label: "Picked up",
    description: "Courier has collected your package from our warehouse.",
    step: 4,
    isTerminal: false,
    isCancellable: false,
  },
  in_transit: {
    code: "in_transit",
    label: "In transit",
    description: "Your package is on its way to you.",
    step: 5,
    isTerminal: false,
    isCancellable: false,
  },
  out_for_delivery: {
    code: "out_for_delivery",
    label: "Out for delivery",
    description: "Your package is out for delivery today.",
    step: 6,
    isTerminal: false,
    isCancellable: false,
  },
  delivered: {
    code: "delivered",
    label: "Delivered",
    description: "Your package has been delivered. Enjoy your order!",
    step: 7,
    isTerminal: true,
    isCancellable: false,
  },
  // ── Edge cases ────────────────────────────────────────────────────────
  cancelled: {
    code: "cancelled",
    label: "Cancelled",
    description: "This order has been cancelled.",
    step: 0,
    isTerminal: true,
    isCancellable: false,
  },
  rto_initiated: {
    code: "rto_initiated",
    label: "Return initiated",
    description: "Package is being returned to our warehouse.",
    step: 0,
    isTerminal: false,
    isCancellable: false,
  },
  rto_delivered: {
    code: "rto_delivered",
    label: "Returned to origin",
    description: "Package has been returned to our warehouse.",
    step: 0,
    isTerminal: true,
    isCancellable: false,
  },
};

/**
 * Resolve a raw Delhivery status string to a stage object.
 * Falls back to a generic "in progress" stage if unknown.
 *
 * @param {string|null} rawStatus - Status from delhiveryApi.trackShipment()
 * @param {object} order - Order object (for pre-shipment stages)
 * @returns {object} Stage object
 */
function resolveDeliveryStage(rawStatus, order) {
  // No AWB yet — determine pre-shipment stage from order status
  if (!order.awbCode) {
    if (order.status === "paid" || order.status === "processing") {
      return DELIVERY_STAGES.payment_confirmed;
    }
    return DELIVERY_STAGES.order_placed;
  }

  // AWB exists — resolve from Delhivery status
  // If tracking failed, fall back to the DB shipmentStatus but map known
  // "manifested-ish" values to the unified internal stage codes.
  const statusSource = rawStatus ?? order.shipmentStatus;
  let key = String(statusSource || "manifested")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (key === "not_created" || key === "created") key = "manifested";
  return DELIVERY_STAGES[key] || {
    code: key,
    label: statusSource || "In progress",
    description: "Your order is being processed.",
    step: 3,
    isTerminal: false,
    isCancellable: false,
  };
}

/**
 * Build the full ordered stage timeline for frontend progress display.
 * Shows all 7 stages with current highlighted.
 *
 * @param {string} currentCode - Stage code of current status
 * @returns {Array<{ code, label, step, completed, active }>}
 */
function buildStageTimeline(currentCode) {
  const mainFlow = [
    "order_placed",
    "payment_confirmed",
    "manifested",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
  ];

  const currentStage = DELIVERY_STAGES[currentCode];
  const currentStep = currentStage?.step || 1;

  return mainFlow.map((code) => {
    const stage = DELIVERY_STAGES[code];
    return {
      code: stage.code,
      label: stage.label,
      step: stage.step,
      completed: stage.step < currentStep,
      active: stage.step === currentStep,
    };
  });
}

module.exports = {
  DELIVERY_STAGES,
  resolveDeliveryStage,
  buildStageTimeline,
};