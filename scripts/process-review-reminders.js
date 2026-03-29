/* eslint-disable no-console */
require("dotenv").config();

const nodemailer = require("nodemailer");
const { sequelize } = require("../src/models");
const {
  fetchDueReminderGroups,
  markRemindersSent,
  buildProductReviewUrl,
} = require("../src/services/reviewReminderService");

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("Missing SMTP config (SMTP_HOST/SMTP_USER/SMTP_PASS).");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function buildEmailHtml({ products }) {
  const intro = `
    <p style="margin:0 0 12px;color:#333;font-size:14px;line-height:1.6;">
      Thanks for shopping with Foxecom. We’d love your feedback—please take a moment to review the products you purchased.
    </p>
  `;

  const items = products
    .map((p) => {
      const url = p.url || buildProductReviewUrl(p.id);
      const title = String(p.title || `Product #${p.id}`);
      const img = p.thumbnailImage
        ? `<img src="${p.thumbnailImage}" alt="${title}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #eee;margin-right:12px;" />`
        : "";

      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;">
              ${img}
              <div style="flex:1;min-width:0;">
                <div style="font-size:14px;color:#111;font-weight:600;line-height:1.3;">${title}</div>
                ${
                  url
                    ? `<div style="margin-top:6px;">
                         <a href="${url}" style="display:inline-block;background:#0d6efd;color:#fff;text-decoration:none;padding:8px 12px;border-radius:6px;font-size:13px;">
                           Write a review
                         </a>
                       </div>`
                    : `<div style="margin-top:6px;color:#666;font-size:12px;">Review link unavailable (missing FRONTEND_URL)</div>`
                }
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head><meta charset="UTF-8" /></head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:24px 0;">
          <table role="presentation" style="max-width:620px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
            <tr>
              <td style="padding:18px 22px;background:#89bb56;color:#fff;">
                <div style="font-size:18px;font-weight:700;">How was your order?</div>
                <div style="font-size:13px;opacity:0.95;margin-top:4px;">Share a quick review for the items below</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;">
                ${intro}
                <table role="presentation" style="width:100%;border-collapse:collapse;">
                  ${items}
                </table>
                <p style="margin:14px 0 0;color:#777;font-size:12px;line-height:1.6;">
                  If you’ve already reviewed an item, you can ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 22px;background:#f1f3f5;color:#888;font-size:11px;text-align:center;">
                © ${new Date().getFullYear()} Foxecom
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

function buildEmailText({ products }) {
  const lines = ["Thanks for shopping with Foxecom.", "", "Please review your purchased products:"];
  for (const p of products) {
    const url = p.url || buildProductReviewUrl(p.id) || "";
    lines.push(`- ${p.title || `Product #${p.id}`}${url ? `: ${url}` : ""}`);
  }
  lines.push("", "If you've already reviewed an item, you can ignore this email.");
  return lines.join("\n");
}

async function main() {
  const transporter = createTransporter();
  const fromEmail = process.env.SMTP_USER;
  const batchLimit = parseInt(process.env.REVIEW_REMINDER_CRON_BATCH_LIMIT, 10) || 200;

  const groups = await fetchDueReminderGroups(batchLimit);
  if (!groups.length) {
    console.log("[ReviewReminderCron] No due reminders.");
    return;
  }

  let sentGroups = 0;
  for (const g of groups) {
    if (!g.email) continue;
    if (!g.products || g.products.length === 0) continue;

    const html = buildEmailHtml({ products: g.products });
    const text = buildEmailText({ products: g.products });

    try {
      await transporter.sendMail({
        from: `"Foxecom" <${fromEmail}>`,
        to: g.email,
        subject: "Please review your recent purchase",
        text,
        html,
      });

      const updated = await markRemindersSent(g.reminderIds);
      console.log("[ReviewReminderCron] Email sent", {
        orderId: g.orderId,
        userId: g.userId,
        email: g.email,
        remindersMarkedSent: updated,
      });
      sentGroups += 1;
    } catch (err) {
      console.error("[ReviewReminderCron] Failed to send reminder email", {
        orderId: g.orderId,
        userId: g.userId,
        email: g.email,
        error: err.message,
      });
    }
  }

  console.log("[ReviewReminderCron] Done", { groups: groups.length, sentGroups });
}

main()
  .catch((e) => {
    console.error("[ReviewReminderCron] Fatal error:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch (e) {
      // ignore
    }
  });

