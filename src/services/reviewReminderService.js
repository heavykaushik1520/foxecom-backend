const { Op } = require("sequelize");
const { Order, OrderItem, CustomerReview, ReviewReminder, Product } = require("../models");

function getDelayDays() {
  const raw = process.env.REVIEW_REMINDER_DELAY_DAYS;
  const n = raw != null ? parseFloat(String(raw)) : NaN;
  // Default for now: 10 minutes (expressed in days).
  const defaultDays = 10 / (24 * 60);
  return Number.isFinite(n) && n >= 0 ? n : defaultDays;
}

function appendUrlQuery(url, query) {
  const q = (query || "").trim().replace(/^\?/, "");
  if (!q) return url;
  return url.includes("?") ? `${url}&${q}` : `${url}?${q}`;
}

/**
 * Link used in review reminder emails. The storefront must show a review form
 * on that page (or on a dedicated route) and call POST /customer/products/:productId/reviews.
 * Optional: set REVIEW_REMINDER_PRODUCT_URL_QUERY=writeReview=1 so the SPA can open the form via searchParams.
 */
function buildProductReviewUrl(productId) {
  const base = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  if (!base) return null;

  const template = (process.env.REVIEW_REMINDER_PRODUCT_URL_TEMPLATE || "").trim();
  const query = process.env.REVIEW_REMINDER_PRODUCT_URL_QUERY || "";

  let url;
  if (template) {
    // Supports "{productId}" placeholder
    url = template.replace("{productId}", String(productId));
  } else {
    // Default guess; can be overridden by REVIEW_REMINDER_PRODUCT_URL_TEMPLATE.
    url = `${base}/product/${productId}`;
  }

  return appendUrlQuery(url, query);
}

async function createReviewRemindersForDeliveredOrder({
  orderId,
  deliveredAt = new Date(),
}) {
  const order = await Order.findByPk(orderId, {
    attributes: ["id", "userId", "emailAddress", "status"],
    include: [{ model: OrderItem, as: "orderItems", attributes: ["productId"] }],
  });

  if (!order) return { created: 0, skippedReviewed: 0, skippedNoItems: 0 };
  // Current flow treats delivery as unlocking review reminders when the order is `paid`.
  // Keep backward compatibility for any rows still using `delivered`.
  if (!["paid", "delivered"].includes(order.status)) {
    return { created: 0, skippedReviewed: 0, skippedNoItems: 0 };
  }

  const productIds = Array.from(
    new Set((order.orderItems || []).map((it) => it.productId).filter(Boolean))
  );

  if (!productIds.length) return { created: 0, skippedReviewed: 0, skippedNoItems: 1 };

  const existingReviews = await CustomerReview.findAll({
    where: { userId: order.userId, productId: { [Op.in]: productIds } },
    attributes: ["productId"],
  });
  const reviewedSet = new Set(existingReviews.map((r) => r.productId));

  const delayDays = getDelayDays();
  const sendAt = new Date(new Date(deliveredAt).getTime() + delayDays * 24 * 60 * 60 * 1000);

  const rows = productIds
    .filter((pid) => !reviewedSet.has(pid))
    .map((pid) => ({
      orderId: order.id,
      productId: pid,
      userId: order.userId,
      email: order.emailAddress,
      sendAt,
      isSent: false,
      isReviewed: false,
    }));

  if (!rows.length) {
    return { created: 0, skippedReviewed: productIds.length, skippedNoItems: 0 };
  }

  // MySQL: ignoreDuplicates maps to INSERT IGNORE; unique index enforces idempotency
  const createdRows = await ReviewReminder.bulkCreate(rows, {
    ignoreDuplicates: true,
  });

  return {
    created: Array.isArray(createdRows) ? createdRows.length : 0,
    skippedReviewed: reviewedSet.size,
    skippedNoItems: 0,
  };
}

async function markReminderReviewed({ userId, productId }) {
  await ReviewReminder.update(
    { isReviewed: true },
    { where: { userId, productId, isReviewed: false } }
  );
}

async function fetchDueReminderGroups(limit = 200) {
  const due = await ReviewReminder.findAll({
    where: {
      sendAt: { [Op.lte]: new Date() },
      isSent: false,
      isReviewed: false,
    },
    order: [["sendAt", "ASC"]],
    limit,
    attributes: ["id", "orderId", "productId", "userId", "email", "sendAt"],
  });

  const groups = new Map();
  for (const r of due) {
    const key = `${r.orderId}:${r.userId}`;
    const g = groups.get(key) || {
      orderId: r.orderId,
      userId: r.userId,
      email: r.email,
      reminderIds: [],
      productIds: [],
    };
    g.reminderIds.push(r.id);
    g.productIds.push(r.productId);
    groups.set(key, g);
  }

  // Hydrate product details (optional but better email)
  const allProductIds = Array.from(new Set(due.map((r) => r.productId)));
  const products = allProductIds.length
    ? await Product.findAll({
        where: { id: { [Op.in]: allProductIds } },
        attributes: ["id", "title", "thumbnailImage"],
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  return Array.from(groups.values()).map((g) => ({
    ...g,
    products: g.productIds
      .map((pid) => {
        const p = productById.get(pid);
        return {
          id: pid,
          title: p?.title || `Product #${pid}`,
          thumbnailImage: p?.thumbnailImage || null,
          url: buildProductReviewUrl(pid),
        };
      })
      // keep unique product ids in case duplicates existed in query set
      .filter((v, idx, arr) => arr.findIndex((x) => x.id === v.id) === idx),
  }));
}

async function markRemindersSent(reminderIds) {
  if (!Array.isArray(reminderIds) || reminderIds.length === 0) return 0;
  const [updatedCount] = await ReviewReminder.update(
    { isSent: true, sentAt: new Date() },
    { where: { id: { [Op.in]: reminderIds }, isSent: false } }
  );
  return updatedCount || 0;
}

module.exports = {
  createReviewRemindersForDeliveredOrder,
  markReminderReviewed,
  fetchDueReminderGroups,
  markRemindersSent,
  buildProductReviewUrl,
};

