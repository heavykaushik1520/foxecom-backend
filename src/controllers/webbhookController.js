const { Order } = require("../models");

exports.shiprocketWebhook = async (req, res) => {
  try {
    // Optional: Verify webhook secret (recommended)
    const incomingSecret = req.headers["x-api-key"];
    const expectedSecret = process.env.SHIPROCKET_WEBHOOK_SECRET;

    if (expectedSecret && incomingSecret !== expectedSecret) {
      return res.status(403).json({ message: "Unauthorized: Invalid webhook secret." });
    }

    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ message: "Invalid or empty webhook payload." });
    }

    const { awb, current_status, order_id } = payload;

    if (!order_id || !current_status) {
      return res.status(400).json({ message: "Missing required fields: order_id or current_status." });
    }

    // Optional: Log payload for debugging
    console.log(" Shiprocket Webhook Payload:", JSON.stringify(payload, null, 2));

    // Update order status
    const [updated] = await Order.update(
      { shipmentStatus: current_status },
      { where: { shiprocketOrderId: order_id } }
    );

    if (updated === 0) {
      return res.status(404).json({ message: "Order not found with the given shiprocketOrderId." });
    }

    return res.status(200).json({ message: "Shipment status updated successfully." });
  } catch (error) {
    console.error(" Shiprocket Webhook Error:", error);
    return res.status(500).json({ message: "Internal server error while processing webhook." });
  }
};
