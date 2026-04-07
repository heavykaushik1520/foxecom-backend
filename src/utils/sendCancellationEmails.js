/**
 * Cancellation Email Utility
 * Sends emails to customer AND admin on every cancellation.
 * Non-throwing — logs errors, never crashes caller.
 */

const nodemailer = require("nodemailer");

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function fmt(amount) {
  return `₹${parseFloat(amount || 0).toFixed(2)}`;
}

/**
 * @param {object} order        - Plain order object (toJSON())
 * @param {object} policyResult - Result from evaluateCancellationPolicy()
 * @param {object|null} refund  - Result from calculatePartialRefund() or null
 */
async function sendCancellationEmails(order, policyResult, refund = null) {
  const adminEmail = (
    process.env.ADMIN_ORDER_EMAIL ||
    process.env.RECEIVER_EMAIL ||
    ""
  ).trim();

  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const orderRef = order.orderNumber || `#${order.id}`;
  const customerName =
    [order.firstName, order.lastName].filter(Boolean).join(" ").trim() ||
    "Customer";
  const ruleLabel = {
    "1": "Cancelled within 24-hour window",
    "2": "Cancelled — shipment label voided",
    "3": "Late cancellation — partial refund",
  }[policyResult.rule] || "Cancelled";

  // ── Customer email ────────────────────────────────────────────────────────
  const refundBlock =
    policyResult.refundType === "full"
      ? `<p style="color:#0f6e56;font-weight:500">
           Your full refund of <strong>${fmt(order.totalAmount)}</strong> will be
           processed within 5–7 business days to your original payment method.
         </p>`
      : refund
      ? `<p style="color:#854f0b">
           <strong>Refund breakdown:</strong><br>
           Order total: ${fmt(refund.originalAmount)}<br>
           GST deducted: ${fmt(refund.gstDeducted)}<br>
           Courier charges deducted: ${fmt(refund.courierDeducted)}<br>
           <strong>Estimated refund: ${fmt(refund.refundAmount)}</strong>
         </p>
         <p style="font-size:12px;color:#888">
           Final refund amount is subject to admin review and will be
           confirmed via email within 2 business days.
         </p>`
      : `<p style="color:#888">Our team will contact you within 2 business days
         regarding your refund.</p>`;

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#333">
      <h2 style="color:#c0392b;border-bottom:1px solid #eee;padding-bottom:8px">
        Order Cancelled — ${orderRef}
      </h2>
      <p>Hi ${customerName},</p>
      <p>Your order <strong>${orderRef}</strong> has been successfully cancelled.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr style="background:#f9f9f9">
          <td style="padding:8px 12px;font-weight:600">Reason</td>
          <td style="padding:8px 12px">${ruleLabel}</td>
        </tr>
        ${order.awbCode ? `
        <tr>
          <td style="padding:8px 12px;font-weight:600">AWB / Tracking</td>
          <td style="padding:8px 12px">${order.awbCode}</td>
        </tr>` : ""}
        <tr style="background:#f9f9f9">
          <td style="padding:8px 12px;font-weight:600">Order Total</td>
          <td style="padding:8px 12px">${fmt(order.totalAmount)}</td>
        </tr>
      </table>
      ${refundBlock}
      <p>If you have any questions, please reply to this email or contact our support team.</p>
      <p style="font-size:11px;color:#aaa;margin-top:24px">
        This is an automated notification. Please do not reply to this email.
      </p>
    </div>`;

  // ── Admin email ───────────────────────────────────────────────────────────
  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#333">
      <h2 style="color:#c0392b">
        ⚠️ Order Cancellation — ${orderRef}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#fef9f0"><td style="padding:7px 12px;font-weight:600;width:40%">Order</td><td style="padding:7px 12px">${orderRef}</td></tr>
        <tr><td style="padding:7px 12px;font-weight:600">Customer</td><td style="padding:7px 12px">${customerName} — ${order.emailAddress} — ${order.mobileNumber}</td></tr>
        <tr style="background:#fef9f0"><td style="padding:7px 12px;font-weight:600">Order total</td><td style="padding:7px 12px">${fmt(order.totalAmount)}</td></tr>
        <tr><td style="padding:7px 12px;font-weight:600">Cancellation rule</td><td style="padding:7px 12px;color:#c0392b"><strong>${ruleLabel}</strong></td></tr>
        <tr style="background:#fef9f0"><td style="padding:7px 12px;font-weight:600">AWB</td><td style="padding:7px 12px">${order.awbCode || "N/A"}</td></tr>
        <tr><td style="padding:7px 12px;font-weight:600">Shipment status</td><td style="padding:7px 12px">${order.shipmentStatus || "N/A"}</td></tr>
        <tr style="background:#fef9f0"><td style="padding:7px 12px;font-weight:600">Cancelled at</td><td style="padding:7px 12px">${new Date().toISOString()}</td></tr>
        ${refund ? `
        <tr><td style="padding:7px 12px;font-weight:600">Suggested refund</td>
            <td style="padding:7px 12px">${refund.breakdown}</td></tr>` : ""}
      </table>
      ${policyResult.rule === "2" ? `
        <p style="color:#c0392b;font-weight:600;margin-top:16px">
          ⚠️ Delhivery cancelShipment API was called for AWB ${order.awbCode}.
          Please verify cancellation in the Delhivery panel.
        </p>` : ""}
      ${policyResult.rule === "3" ? `
        <p style="color:#854f0b;font-weight:600;margin-top:16px">
          ACTION REQUIRED: Confirm the refund amount above and process manually.
          Contact customer at ${order.emailAddress} with final refund amount.
        </p>` : ""}
    </div>`;

  const jobs = [
    transporter.sendMail({
      from,
      to: order.emailAddress,
      subject: `Your order ${orderRef} has been cancelled`,
      html: customerHtml,
    }),
  ];

  if (adminEmail) {
    jobs.push(
      transporter.sendMail({
        from,
        to: adminEmail,
        subject: `[CANCEL ${policyResult.rule === "3" ? "⚠️ ACTION NEEDED" : ""}] Order ${orderRef} — ${customerName}`,
        html: adminHtml,
      })
    );
  }

  const results = await Promise.allSettled(jobs);
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[CancellationEmail] Email job #${i} failed:`, r.reason?.message);
    }
  });
}

module.exports = { sendCancellationEmails };