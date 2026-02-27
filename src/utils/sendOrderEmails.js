// src/utils/sendOrderEmails.js
const nodemailer = require("nodemailer");

// Create reusable transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Format currency
const formatCurrency = (amount) => {
  return `₹${parseFloat(amount).toFixed(2)}`;
};

// Format date
const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Generate product rows HTML for email
const generateProductRowsHTML = (orderItems) => {
  return orderItems
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
          <strong>${item.product?.title || "Product"}</strong>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">
          ${item.quantity}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">
          ${formatCurrency(item.priceAtPurchase)}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">
          ${formatCurrency(item.priceAtPurchase * item.quantity)}
        </td>
      </tr>
    `
    )
    .join("");
};

// Customer Email Template
const getCustomerEmailHTML = (order, orderItems) => {
  const productRows = generateProductRowsHTML(orderItems);
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #89bb56; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Order Confirmed!</h1>
              <p style="color: #ffffff; margin: 10px 0 0; opacity: 0.9;">Thank you for your purchase</p>
            </td>
          </tr>
          
          <!-- Order Info -->
          <tr>
            <td style="padding: 30px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hi <strong>${order.firstName}</strong>,
              </p>
              <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
                Your order has been successfully placed and payment has been received. We're preparing your order for shipment.
              </p>
              
              <!-- Order Summary Box -->
              <table role="presentation" style="width: 100%; background-color: #f9f9f9; border-radius: 6px; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 5px 0;">
                          <span style="color: #666; font-size: 14px;">Order Number:</span>
                          <strong style="color: #333; font-size: 14px; float: right;">#${order.id}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0;">
                          <span style="color: #666; font-size: 14px;">Order Date:</span>
                          <strong style="color: #333; font-size: 14px; float: right;">${formatDate(order.createdAt)}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0;">
                          <span style="color: #666; font-size: 14px;">Payment ID:</span>
                          <strong style="color: #333; font-size: 14px; float: right;">${order.payuPaymentId || order.payuTxnId || "N/A"}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Products Table -->
              <h3 style="color: #333; font-size: 18px; margin: 0 0 15px; border-bottom: 2px solid #89bb56; padding-bottom: 10px;">
                Order Details (${totalItems} item${totalItems > 1 ? "s" : ""})
              </h3>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr style="background-color: #f0f0f0;">
                  <th style="padding: 12px; text-align: left; font-size: 14px; color: #333;">Product</th>
                  <th style="padding: 12px; text-align: center; font-size: 14px; color: #333;">Qty</th>
                  <th style="padding: 12px; text-align: right; font-size: 14px; color: #333;">Price</th>
                  <th style="padding: 12px; text-align: right; font-size: 14px; color: #333;">Total</th>
                </tr>
                ${productRows}
                <tr style="background-color: #89bb56;">
                  <td colspan="3" style="padding: 15px; text-align: right; color: #fff; font-weight: bold; font-size: 16px;">
                    Total Amount:
                  </td>
                  <td style="padding: 15px; text-align: right; color: #fff; font-weight: bold; font-size: 18px;">
                    ${formatCurrency(order.totalAmount)}
                  </td>
                </tr>
              </table>
              
              <!-- Shipping Address -->
              <h3 style="color: #333; font-size: 18px; margin: 25px 0 15px; border-bottom: 2px solid #89bb56; padding-bottom: 10px;">
                Shipping Address
              </h3>
              <table role="presentation" style="width: 100%; background-color: #f9f9f9; border-radius: 6px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 5px; color: #333; font-weight: bold;">
                      ${order.firstName} ${order.lastName}
                    </p>
                    <p style="margin: 0 0 5px; color: #555; line-height: 1.5;">
                      ${order.fullAddress}<br>
                      ${order.townOrCity}, ${order.state} - ${order.pinCode}<br>
                      ${order.country}
                    </p>
                    <p style="margin: 10px 0 0; color: #555;">
                      <strong>Phone:</strong> ${order.mobileNumber}<br>
                      <strong>Email:</strong> ${order.emailAddress}
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- What's Next -->
              <table role="presentation" style="width: 100%; margin-top: 25px; background-color: #fff8e1; border-radius: 6px; border-left: 4px solid #ffc107;">
                <tr>
                  <td style="padding: 20px;">
                    <h4 style="margin: 0 0 10px; color: #333;">What's Next?</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #555; line-height: 1.8;">
                      <li>We're processing your order</li>
                      <li>You'll receive a shipping confirmation email with tracking details</li>
                      <li>Estimated delivery: 3-7 business days</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #333; padding: 25px; text-align: center;">
              <p style="color: #fff; margin: 0 0 10px; font-size: 14px;">
                If you have any questions, please contact our support team.
              </p>
              <p style="color: #aaa; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} FoxEcom. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

// Admin Email Template
const getAdminEmailHTML = (order, orderItems) => {
  const productRows = generateProductRowsHTML(orderItems);
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Order Received</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #2c3e50; padding: 25px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🛒 New Order Received!</h1>
              <p style="color: #ecf0f1; margin: 10px 0 0; font-size: 16px;">Order #${order.id} | ${formatCurrency(order.totalAmount)}</p>
            </td>
          </tr>
          
          <!-- Alert Banner -->
          <tr>
            <td style="background-color: #27ae60; padding: 15px; text-align: center;">
              <span style="color: #fff; font-size: 14px; font-weight: bold;">
                ✅ PAYMENT SUCCESSFUL - Ready to Process
              </span>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              
              <!-- Order & Payment Info -->
              <table role="presentation" style="width: 100%; margin-bottom: 25px;">
                <tr>
                  <td style="width: 50%; vertical-align: top; padding-right: 15px;">
                    <h3 style="color: #2c3e50; font-size: 16px; margin: 0 0 15px; border-bottom: 2px solid #3498db; padding-bottom: 8px;">
                      Order Information
                    </h3>
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 13px;">Order ID:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 13px; font-weight: bold;">#${order.id}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 13px;">Order Date:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 13px;">${formatDate(order.createdAt)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 13px;">Status:</td>
                        <td style="padding: 5px 0;">
                          <span style="background-color: #27ae60; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                            PAID
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 13px;">Total Items:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 13px;">${totalItems}</td>
                      </tr>
                    </table>
                  </td>
                  <td style="width: 50%; vertical-align: top; padding-left: 15px;">
                    <h3 style="color: #2c3e50; font-size: 16px; margin: 0 0 15px; border-bottom: 2px solid #3498db; padding-bottom: 8px;">
                      Payment Details
                    </h3>
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 13px;">Payment ID:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 13px; word-break: break-all;">${order.payuPaymentId || order.payuTxnId || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 13px;">Transaction ID:</td>
                        <td style="padding: 5px 0; color: #333; font-size: 13px; word-break: break-all;">${order.payuTxnId || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #666; font-size: 13px;">Total Amount:</td>
                        <td style="padding: 5px 0; color: #27ae60; font-size: 16px; font-weight: bold;">${formatCurrency(order.totalAmount)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Customer Information -->
              <h3 style="color: #2c3e50; font-size: 16px; margin: 0 0 15px; border-bottom: 2px solid #e74c3c; padding-bottom: 8px;">
                👤 Customer Information
              </h3>
              <table role="presentation" style="width: 100%; background-color: #fdf2f2; border-radius: 6px; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="width: 50%; vertical-align: top;">
                          <p style="margin: 0 0 8px; color: #333;">
                            <strong>Name:</strong> ${order.firstName} ${order.lastName}
                          </p>
                          <p style="margin: 0 0 8px; color: #333;">
                            <strong>Email:</strong> <a href="mailto:${order.emailAddress}" style="color: #3498db;">${order.emailAddress}</a>
                          </p>
                          <p style="margin: 0; color: #333;">
                            <strong>Phone:</strong> <a href="tel:${order.mobileNumber}" style="color: #3498db;">${order.mobileNumber}</a>
                          </p>
                        </td>
                        <td style="width: 50%; vertical-align: top;">
                          <p style="margin: 0 0 8px; color: #333;">
                            <strong>User ID:</strong> ${order.userId}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Shipping Address -->
              <h3 style="color: #2c3e50; font-size: 16px; margin: 0 0 15px; border-bottom: 2px solid #9b59b6; padding-bottom: 8px;">
                📦 Shipping Address
              </h3>
              <table role="presentation" style="width: 100%; background-color: #f5f0ff; border-radius: 6px; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #333; font-weight: bold; font-size: 15px;">
                      ${order.firstName} ${order.lastName}
                    </p>
                    <p style="margin: 0; color: #555; line-height: 1.6;">
                      ${order.fullAddress}<br>
                      ${order.townOrCity}, ${order.state}<br>
                      PIN: <strong>${order.pinCode}</strong><br>
                      ${order.country}
                    </p>
                    <p style="margin: 15px 0 0; padding-top: 10px; border-top: 1px dashed #ccc; color: #555;">
                      📞 ${order.mobileNumber} &nbsp;&nbsp;|&nbsp;&nbsp; ✉️ ${order.emailAddress}
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Products Table -->
              <h3 style="color: #2c3e50; font-size: 16px; margin: 0 0 15px; border-bottom: 2px solid #f39c12; padding-bottom: 8px;">
                🛍️ Ordered Products
              </h3>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #ddd;">
                <tr style="background-color: #34495e;">
                  <th style="padding: 12px; text-align: left; font-size: 13px; color: #fff;">Product Name</th>
                  <th style="padding: 12px; text-align: center; font-size: 13px; color: #fff;">Qty</th>
                  <th style="padding: 12px; text-align: right; font-size: 13px; color: #fff;">Unit Price</th>
                  <th style="padding: 12px; text-align: right; font-size: 13px; color: #fff;">Subtotal</th>
                </tr>
                ${productRows}
              </table>
              
              <!-- Total Box -->
              <table role="presentation" style="width: 100%; margin-bottom: 20px;">
                <tr>
                  <td style="text-align: right;">
                    <table role="presentation" style="display: inline-block; background-color: #2c3e50; border-radius: 6px;">
                      <tr>
                        <td style="padding: 15px 25px;">
                          <span style="color: #bdc3c7; font-size: 14px;">Order Total:</span>
                          <span style="color: #fff; font-size: 22px; font-weight: bold; margin-left: 15px;">
                            ${formatCurrency(order.totalAmount)}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Action Required -->
              <table role="presentation" style="width: 100%; background-color: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107;">
                <tr>
                  <td style="padding: 20px;">
                    <h4 style="margin: 0 0 10px; color: #856404;">⚡ Action Required</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #856404; line-height: 1.8; font-size: 14px;">
                      <li>Process and pack this order</li>
                      <li>Create shipment in Shiprocket</li>
                      <li>Update order status to "Processing"</li>
                    </ul>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #2c3e50; padding: 20px; text-align: center;">
              <p style="color: #bdc3c7; margin: 0; font-size: 12px;">
                This is an automated notification from FoxEcom Admin System<br>
                Generated on ${formatDate(new Date())}
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

// Plain text fallback for customer
const getCustomerEmailText = (order, orderItems) => {
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const productList = orderItems
    .map(
      (item) =>
        `- ${item.product?.title || "Product"} x ${item.quantity} = ${formatCurrency(item.priceAtPurchase * item.quantity)}`
    )
    .join("\n");

  return `
ORDER CONFIRMATION

Hi ${order.firstName},

Thank you for your order! Your payment has been successfully received.

ORDER DETAILS
-------------
Order Number: #${order.id}
Order Date: ${formatDate(order.createdAt)}
Payment ID: ${order.payuPaymentId || order.payuTxnId || "N/A"}

PRODUCTS (${totalItems} items)
${productList}

TOTAL: ${formatCurrency(order.totalAmount)}

SHIPPING ADDRESS
----------------
${order.firstName} ${order.lastName}
${order.fullAddress}
${order.townOrCity}, ${order.state} - ${order.pinCode}
${order.country}
Phone: ${order.mobileNumber}
Email: ${order.emailAddress}

WHAT'S NEXT?
- We're processing your order
- You'll receive a shipping confirmation email with tracking details
- Estimated delivery: 3-7 business days

If you have any questions, please contact our support team.

© ${new Date().getFullYear()} FoxEcom. All rights reserved.
`;
};

// Plain text fallback for admin
const getAdminEmailText = (order, orderItems) => {
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const productList = orderItems
    .map(
      (item) =>
        `- ${item.product?.title || "Product"} x ${item.quantity} @ ${formatCurrency(item.priceAtPurchase)} = ${formatCurrency(item.priceAtPurchase * item.quantity)}`
    )
    .join("\n");

  return `
NEW ORDER RECEIVED - PAYMENT SUCCESSFUL

ORDER INFORMATION
-----------------
Order ID: #${order.id}
Order Date: ${formatDate(order.createdAt)}
Status: PAID
Total Items: ${totalItems}
Total Amount: ${formatCurrency(order.totalAmount)}

PAYMENT DETAILS
---------------
Payment ID: ${order.payuPaymentId || order.payuTxnId || "N/A"}
Transaction ID: ${order.payuTxnId || "N/A"}

CUSTOMER INFORMATION
--------------------
Name: ${order.firstName} ${order.lastName}
Email: ${order.emailAddress}
Phone: ${order.mobileNumber}
User ID: ${order.userId}

SHIPPING ADDRESS
----------------
${order.firstName} ${order.lastName}
${order.fullAddress}
${order.townOrCity}, ${order.state}
PIN: ${order.pinCode}
${order.country}
Phone: ${order.mobileNumber}

ORDERED PRODUCTS
----------------
${productList}

TOTAL: ${formatCurrency(order.totalAmount)}

ACTION REQUIRED:
- Process and pack this order
- Create shipment in Shiprocket
- Update order status to "Processing"

---
Automated notification from FoxEcom Admin System
Generated on ${formatDate(new Date())}
`;
};

/**
 * Send order confirmation emails to customer and admin
 * @param {Object} order - The order object with all details
 * @param {Array} orderItems - Array of order items with product details
 * @param {String} adminEmail - Admin email address (optional, uses env if not provided)
 */
const sendOrderEmails = async (order, orderItems, adminEmail = null) => {
  const transporter = createTransporter();
  const fromEmail = process.env.SMTP_USER;
  // Priority: passed adminEmail > ADMIN_ORDER_EMAIL > RECEIVER_EMAIL
  const adminRecipient = adminEmail || process.env.ADMIN_ORDER_EMAIL || process.env.RECEIVER_EMAIL;

  const results = {
    customerEmail: { sent: false, error: null },
    adminEmail: { sent: false, error: null },
  };

  // Send customer email
  try {
    const customerMailOptions = {
      from: `"FoxEcom" <${fromEmail}>`,
      to: order.emailAddress,
      subject: `Order Confirmed! Your Order #${order.id} has been placed`,
      text: getCustomerEmailText(order, orderItems),
      html: getCustomerEmailHTML(order, orderItems),
    };

    await transporter.sendMail(customerMailOptions);
    results.customerEmail.sent = true;
    console.log(`✅ Customer order confirmation email sent to: ${order.emailAddress}`);
  } catch (error) {
    results.customerEmail.error = error.message;
    console.error(`❌ Failed to send customer email:`, error.message);
  }

  // Send admin email
  try {
    if (adminRecipient) {
      const adminMailOptions = {
        from: `"FoxEcom Orders" <${fromEmail}>`,
        to: adminRecipient,
        subject: `🛒 New Order #${order.id} - ${formatCurrency(order.totalAmount)} - Payment Received`,
        text: getAdminEmailText(order, orderItems),
        html: getAdminEmailHTML(order, orderItems),
      };

      await transporter.sendMail(adminMailOptions);
      results.adminEmail.sent = true;
      console.log(`✅ Admin order notification email sent to: ${adminRecipient}`);
    } else {
      results.adminEmail.error = "No admin email configured";
      console.warn("⚠️ Admin email not sent: No RECEIVER_EMAIL configured");
    }
  } catch (error) {
    results.adminEmail.error = error.message;
    console.error(`❌ Failed to send admin email:`, error.message);
  }

  return results;
};

module.exports = {
  sendOrderEmails,
  getCustomerEmailHTML,
  getAdminEmailHTML,
};

/**
 * Send shipment confirmation email to customer when Delhivery shipment is created.
 * Uses SMTP_USER as sender. Safe to call multiple times – email is idempotent in effect.
 * @param {Object} params
 * @param {Object} params.order - Order instance or plain object with at least id, firstName, lastName, emailAddress
 * @param {string} params.awb - AWB / waybill number
 * @param {string|null} [params.labelUrl] - Optional label URL
 * @param {string|null} [params.trackUrl] - Optional frontend track URL
 */
async function sendShipmentEmailToCustomer({ order, awb, labelUrl = null, trackUrl = null }) {
  if (!order || !order.emailAddress || !awb) {
    console.warn('[ShipmentEmail] Skipping – missing order/email/awb', {
      hasOrder: Boolean(order),
      hasEmail: Boolean(order && order.emailAddress),
      hasAwb: Boolean(awb),
    });
    return;
  }

  const transporter = createTransporter();
  const fromEmail = process.env.SMTP_USER;
  const frontendBase = process.env.FRONTEND_URL || '';
  const safeTrackUrl =
    trackUrl ||
    (frontendBase
      ? `${frontendBase.replace(/\/+$/, '')}/order/${order.id}/track`
      : null);

  const subject = `Your order #${order.id} has been shipped – AWB ${awb}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shipment Update</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:24px 0;">
        <table role="presentation" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#0d6efd;padding:24px 24px 20px;text-align:left;">
              <h1 style="margin:0;font-size:22px;color:#ffffff;">Your order is on the way</h1>
              <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.9);">
                Order #${order.id} • AWB ${awb}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;color:#333;">
                Hi <strong>${order.firstName || ''} ${order.lastName || ''}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.6;">
                Your order has been handed over to our courier partner. You can use the details below to track your delivery.
              </p>

              <table role="presentation" style="width:100%;background:#f8f9fa;border-radius:6px;margin:0 0 16px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:14px;color:#666;">
                      <span style="color:#6c757d;">Order number:</span>
                      <span style="float:right;color:#212529;font-weight:600;">#${order.id}</span>
                    </p>
                    <p style="margin:0 0 6px;font-size:14px;color:#666;">
                      <span style="color:#6c757d;">AWB / Waybill:</span>
                      <span style="float:right;color:#212529;font-weight:600;">${awb}</span>
                    </p>
                    ${
                      labelUrl
                        ? `<p style="margin:0 0 6px;font-size:14px;">
                      <span style="color:#6c757d;">Label:</span>
                      <span style="float:right;">
                        <a href="${labelUrl}" style="color:#0d6efd;text-decoration:none;" target="_blank" rel="noopener noreferrer">
                          View / Print
                        </a>
                      </span>
                    </p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>

              ${
                safeTrackUrl
                  ? `<div style="margin:0 0 20px;text-align:center;">
                <a href="${safeTrackUrl}" target="_blank" rel="noopener noreferrer"
                   style="display:inline-block;padding:10px 20px;border-radius:999px;background:#0d6efd;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;">
                  Track your order
                </a>
              </div>`
                  : ''
              }

              <p style="margin:0 0 4px;font-size:13px;color:#666;">
                <strong>Shipping to:</strong>
              </p>
              <p style="margin:0 0 12px;font-size:13px;color:#555;line-height:1.5;">
                ${order.fullAddress || ''}<br/>
                ${order.townOrCity || ''}, ${order.state || ''} - ${order.pinCode || ''}<br/>
                ${order.country || ''}
              </p>

              <p style="margin:0;font-size:12px;color:#999;line-height:1.6;">
                If you have any questions about your delivery, just reply to this email and our team will be happy to help.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f1f3f5;padding:16px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#868e96;">
                © ${new Date().getFullYear()} FoxEcom. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `Your shipment is on the way.

Order #${order.id}
AWB / Waybill: ${awb}

${safeTrackUrl ? `Track your order: ${safeTrackUrl}\n\n` : ''}
Shipping to:
${order.fullAddress || ''}
${order.townOrCity || ''}, ${order.state || ''} - ${order.pinCode || ''}
${order.country || ''}
`;

  try {
    await transporter.sendMail({
      from: `"FoxEcom Orders" <${fromEmail}>`,
      to: order.emailAddress,
      subject,
      text,
      html,
    });
    console.log('[ShipmentEmail] Shipment email sent to customer', {
      orderId: order.id,
      email: order.emailAddress,
      awb,
    });
  } catch (err) {
    console.error('[ShipmentEmail] Failed to send shipment email', {
      orderId: order.id,
      email: order.emailAddress,
      awb,
      error: err.message,
    });
  }
}

module.exports = {
  sendOrderEmails,
  getCustomerEmailHTML,
  getAdminEmailHTML,
  sendShipmentEmailToCustomer,
};
