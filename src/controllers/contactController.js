// src/controllers/contactController.js
const nodemailer = require("nodemailer");

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
const onlyDigits = (value) => String(value || "").replace(/[^\d]/g, "");

const createContactTransporter = () => {
  const host = process.env.CONTACT_SMTP_HOST;
  const port = parseInt(process.env.CONTACT_SMTP_PORT, 10) || 587;
  const user = process.env.CONTACT_SMTP_USER;
  const pass = process.env.CONTACT_SMTP_PASS;

  if (!host || !user || !pass) {
    const missing = [
      !host ? "CONTACT_SMTP_HOST" : null,
      !user ? "CONTACT_SMTP_USER" : null,
      !pass ? "CONTACT_SMTP_PASS" : null,
    ].filter(Boolean);
    const err = new Error(`Contact email is not configured (missing: ${missing.join(", ")})`);
    err.statusCode = 500;
    throw err;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

// POST /api/contact
async function submitContactForm(req, res) {
  try {
    const { name, email, phone, message } = req.body || {};

    const trimmedName = String(name || "").trim();
    const trimmedEmail = String(email || "").trim();
    const trimmedMessage = String(message || "").trim();
    const phoneDigits = onlyDigits(phone);

    const errors = [];
    if (!trimmedName) errors.push("Name is required.");
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) errors.push("Valid email is required.");
    if (!phoneDigits || phoneDigits.length < 10) errors.push("Valid phone number is required.");
    if (!trimmedMessage) errors.push("Message is required.");

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: "Validation failed.", errors });
    }

    const receiver = process.env.CONTACT_RECEIVER_EMAIL;
    if (!receiver) {
      return res.status(500).json({
        success: false,
        message: "Contact receiver email is not configured (CONTACT_RECEIVER_EMAIL).",
      });
    }

    const transporter = createContactTransporter();
    const fromEmail = process.env.CONTACT_SMTP_USER;

    const subject = `New Contact Form Message - ${trimmedName}`;
    const text = [
      "New contact form submission",
      "---------------------------",
      `Name: ${trimmedName}`,
      `Email: ${trimmedEmail}`,
      `Phone: ${phoneDigits}`,
      "",
      "Message:",
      trimmedMessage,
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2 style="margin: 0 0 10px;">New Contact Form Submission</h2>
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
          <tr><td style="padding: 6px 0;"><strong>Name:</strong></td><td style="padding: 6px 0;">${trimmedName}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Email:</strong></td><td style="padding: 6px 0;"><a href="mailto:${trimmedEmail}">${trimmedEmail}</a></td></tr>
          <tr><td style="padding: 6px 0;"><strong>Phone:</strong></td><td style="padding: 6px 0;"><a href="tel:${phoneDigits}">${phoneDigits}</a></td></tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />
        <h3 style="margin: 0 0 8px;">Message</h3>
        <p style="white-space: pre-wrap; margin: 0;">${trimmedMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      </div>
    `;

    // Send to admin/support
    await transporter.sendMail({
      from: `"FoxEcom Contact" <${fromEmail}>`,
      to: receiver,
      subject,
      text,
      html,
      replyTo: trimmedEmail,
    });

    // Optional auto-reply to user (standard UX)
    try {
      await transporter.sendMail({
        from: `"FoxEcom Support" <${fromEmail}>`,
        to: trimmedEmail,
        subject: "We received your message",
        text: `Hi ${trimmedName},\n\nThanks for contacting FoxEcom. We received your message and will get back to you soon.\n\nYour message:\n${trimmedMessage}\n\nRegards,\nFoxEcom Support`,
      });
    } catch (autoReplyErr) {
      // don't fail the request if auto-reply fails
      console.warn("Contact auto-reply failed:", autoReplyErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Thank you! We received your message and will contact you soon.",
    });
  } catch (err) {
    console.error("Contact form error:", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Failed to submit contact form.",
    });
  }
}

module.exports = {
  submitContactForm,
};

