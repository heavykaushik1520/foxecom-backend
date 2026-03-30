const { pool } = require('../config/analyticsPool');

const MAX_PAGE_LEN = 512;
const MAX_VISITOR_ID_LEN = 128;
const MAX_USER_AGENT_LEN = 8000;

function toNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizePage(page) {
  if (typeof page !== 'string') return '/';
  let p = page.trim();
  if (!p) return '/';
  if (!p.startsWith('/')) p = `/${p}`;
  return p.length > MAX_PAGE_LEN ? p.slice(0, MAX_PAGE_LEN) : p;
}

function normalizeVisitorId(visitorId) {
  if (typeof visitorId !== 'string') return null;
  const id = visitorId.trim();
  if (id.length < 8 || id.length > MAX_VISITOR_ID_LEN) return null;
  if (!/^[0-9a-zA-Z_-]{8,128}$/.test(id)) return null;
  return id;
}

function truncateUserAgent(ua) {
  if (typeof ua !== 'string' || !ua) return null;
  return ua.length > MAX_USER_AGENT_LEN ? ua.slice(0, MAX_USER_AGENT_LEN) : ua;
}

function formatDateKey(d) {
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * @param {{ visitorId: string, page: string, ip: string, userAgent: string | null }} params
 */
async function recordVisit({ visitorId, page, ip, userAgent }) {
  const vid = normalizeVisitorId(visitorId);
  if (!vid) {
    const err = new Error('Invalid visitorId');
    err.statusCode = 400;
    throw err;
  }
  const pg = normalizePage(page);
  const ipStr = typeof ip === 'string' ? ip.slice(0, 64) : '';
  const ua = truncateUserAgent(userAgent);

  await pool.execute(
    `INSERT INTO website_visits (visitor_id, page, ip_address, user_agent, visit_date, visited_at)
     VALUES (?, ?, ?, ?, CURDATE(), NOW())`,
    [vid, pg, ipStr, ua]
  );
}

async function getSummary() {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM website_visits) AS totalPageViews,
       (SELECT COUNT(DISTINCT visitor_id) FROM website_visits) AS uniqueVisitors,
       (SELECT COUNT(DISTINCT visitor_id) FROM website_visits WHERE visit_date = CURDATE()) AS todayUniqueVisitors,
       (SELECT COUNT(*) FROM website_visits WHERE visit_date = CURDATE()) AS todayPageViews`
  );
  const r = rows[0] || {};
  return {
    totalPageViews: toNumber(r.totalPageViews),
    uniqueVisitors: toNumber(r.uniqueVisitors),
    todayUniqueVisitors: toNumber(r.todayUniqueVisitors),
    todayPageViews: toNumber(r.todayPageViews),
  };
}

async function getPageStats() {
  const [rows] = await pool.query(
    `SELECT
       page,
       COUNT(*) AS totalViews,
       COUNT(DISTINCT visitor_id) AS uniqueVisitors,
       COUNT(DISTINCT CASE WHEN visit_date = CURDATE() THEN visitor_id END) AS todayUniqueVisitors
     FROM website_visits
     GROUP BY page
     ORDER BY totalViews DESC`
  );
  return rows.map((row) => ({
    page: row.page,
    totalViews: toNumber(row.totalViews),
    uniqueVisitors: toNumber(row.uniqueVisitors),
    todayUniqueVisitors: toNumber(row.todayUniqueVisitors),
  }));
}

/**
 * Last N calendar days including today (visit_date in DB).
 * @param {number} days
 */
async function getDailyStats(days) {
  const n = Math.min(Math.max(Number(days) || 30, 1), 366);
  const intervalDays = n - 1;

  const [rows] = await pool.query(
    `SELECT
       visit_date AS date,
       COUNT(*) AS totalViews,
       COUNT(DISTINCT visitor_id) AS uniqueVisitors
     FROM website_visits
     WHERE visit_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY visit_date
     ORDER BY visit_date ASC`,
    [intervalDays]
  );

  const byDate = new Map();
  for (const row of rows) {
    byDate.set(formatDateKey(row.date), {
      totalViews: toNumber(row.totalViews),
      uniqueVisitors: toNumber(row.uniqueVisitors),
    });
  }

  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const stats = byDate.get(key) || { totalViews: 0, uniqueVisitors: 0 };
    out.push({
      date: key,
      totalViews: stats.totalViews,
      uniqueVisitors: stats.uniqueVisitors,
    });
  }
  return out;
}

/** Non-cancelled orders only (same units as shipped revenue reporting). */
const SALES_ORDER_FILTER = "o.status <> 'cancelled'";

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Optional rolling window on order `createdAt`.
 * @param {number | null | undefined} days
 */
function salesDateFilter(days) {
  if (days == null || !Number.isFinite(Number(days)) || Number(days) <= 0) {
    return { clause: '', params: [] };
  }
  const d = Math.min(Math.max(Math.floor(Number(days)), 1), 3660);
  return {
    clause: ' AND o.`createdAt` >= DATE_SUB(NOW(), INTERVAL ? DAY) ',
    params: [d],
  };
}

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * One case-details row per product (avoids duplicate joins if data has multiples).
 */
const CASE_DETAILS_JOIN = `
  LEFT JOIN (
    SELECT cd0.*
    FROM \`caseDetails\` cd0
    INNER JOIN (
      SELECT productId, MIN(id) AS pickId FROM \`caseDetails\` GROUP BY productId
    ) pick ON pick.pickId = cd0.id
  ) cd ON cd.productId = p.id
`;

/**
 * Sales analytics from order line items (admin).
 * @param {{ days?: number | null, limit?: number }} opts
 */
async function getSalesAnalytics(opts = {}) {
  const limit = clampInt(opts.limit, 1, 200, 50);
  const { clause: dateClause, params: dateParams } = salesDateFilter(opts.days);

  const baseJoin = `
    FROM \`order_items\` oi
    INNER JOIN \`orders\` o ON oi.orderId = o.id
    INNER JOIN \`products\` p ON oi.productId = p.id
    ${CASE_DETAILS_JOIN}
    LEFT JOIN \`mobileBrands\` mb ON cd.brandId = mb.id
    LEFT JOIN \`mobileModels\` mm ON cd.modelId = mm.id
    WHERE ${SALES_ORDER_FILTER}${dateClause}
  `;

  const totalsParams = [...dateParams];
  const [totRows] = await pool.query(
    `SELECT
       COALESCE(SUM(oi.quantity), 0) AS unitsSold,
       COALESCE(SUM(oi.quantity * oi.priceAtPurchase), 0) AS revenue,
       COUNT(DISTINCT oi.orderId) AS orderCount,
       COUNT(*) AS lineItemCount
     FROM \`order_items\` oi
     INNER JOIN \`orders\` o ON oi.orderId = o.id
     WHERE ${SALES_ORDER_FILTER}${dateClause}`,
    totalsParams
  );
  const t = totRows[0] || {};
  const totals = {
    unitsSold: toNumber(t.unitsSold),
    revenue: roundMoney(t.revenue),
    orderCount: toNumber(t.orderCount),
    lineItemCount: toNumber(t.lineItemCount),
  };

  const topParams = [...dateParams, limit];
  const [topRows] = await pool.query(
    `SELECT
       p.id AS productId,
       p.title AS productTitle,
       p.sku AS sku,
       p.thumbnailImage AS thumbnailImage,
       COALESCE(SUM(oi.quantity), 0) AS unitsSold,
       COALESCE(SUM(oi.quantity * oi.priceAtPurchase), 0) AS revenue,
       COUNT(DISTINCT oi.orderId) AS orderCount
     FROM \`order_items\` oi
     INNER JOIN \`orders\` o ON oi.orderId = o.id
     INNER JOIN \`products\` p ON oi.productId = p.id
     WHERE ${SALES_ORDER_FILTER}${dateClause}
     GROUP BY p.id, p.title, p.sku, p.thumbnailImage
     ORDER BY unitsSold DESC, revenue DESC
     LIMIT ?`,
    topParams
  );

  const brandParams = [...dateParams];
  const [brandRows] = await pool.query(
    `SELECT
       COALESCE(cd.brandId, 0) AS brandId,
       COALESCE(mb.name, 'Not linked (no case details)') AS brandName,
       COALESCE(SUM(oi.quantity), 0) AS unitsSold,
       COALESCE(SUM(oi.quantity * oi.priceAtPurchase), 0) AS revenue,
       COUNT(DISTINCT oi.orderId) AS orderCount
     ${baseJoin}
     GROUP BY COALESCE(cd.brandId, 0), COALESCE(mb.name, 'Not linked (no case details)')
     ORDER BY unitsSold DESC, revenue DESC`,
    brandParams
  );

  const modelParams = [...dateParams];
  const [modelRows] = await pool.query(
    `SELECT
       COALESCE(cd.modelId, 0) AS modelId,
       COALESCE(mm.name, 'Not linked') AS modelName,
       COALESCE(cd.brandId, 0) AS brandId,
       COALESCE(mb.name, '—') AS brandName,
       COALESCE(SUM(oi.quantity), 0) AS unitsSold,
       COALESCE(SUM(oi.quantity * oi.priceAtPurchase), 0) AS revenue,
       COUNT(DISTINCT oi.orderId) AS orderCount
     ${baseJoin}
     GROUP BY COALESCE(cd.modelId, 0), COALESCE(mm.name, 'Not linked'),
              COALESCE(cd.brandId, 0), COALESCE(mb.name, '—')
     ORDER BY unitsSold DESC, revenue DESC`,
    modelParams
  );

  const deviceExpr = `COALESCE(
    NULLIF(TRIM(cd.caseType), ''),
    NULLIF(TRIM(cd.material), ''),
    'Unspecified'
  )`;

  const deviceParams = [...dateParams];
  const [deviceRows] = await pool.query(
    `SELECT
       ${deviceExpr} AS deviceLabel,
       COALESCE(SUM(oi.quantity), 0) AS unitsSold,
       COALESCE(SUM(oi.quantity * oi.priceAtPurchase), 0) AS revenue,
       COUNT(DISTINCT oi.orderId) AS orderCount
     ${baseJoin}
     GROUP BY ${deviceExpr}
     ORDER BY unitsSold DESC, revenue DESC`,
    deviceParams
  );

  const topProducts = topRows.map((row) => ({
    productId: toNumber(row.productId),
    productTitle: row.productTitle,
    sku: row.sku,
    thumbnailImage: row.thumbnailImage,
    unitsSold: toNumber(row.unitsSold),
    revenue: roundMoney(row.revenue),
    orderCount: toNumber(row.orderCount),
  }));

  const byBrand = brandRows.map((row) => ({
    brandId: toNumber(row.brandId),
    brandName: row.brandName,
    unitsSold: toNumber(row.unitsSold),
    revenue: roundMoney(row.revenue),
    orderCount: toNumber(row.orderCount),
  }));

  const byModel = modelRows.map((row) => ({
    modelId: toNumber(row.modelId),
    modelName: row.modelName,
    brandId: toNumber(row.brandId),
    brandName: row.brandName,
    unitsSold: toNumber(row.unitsSold),
    revenue: roundMoney(row.revenue),
    orderCount: toNumber(row.orderCount),
  }));

  const byDevice = deviceRows.map((row) => ({
    deviceLabel: row.deviceLabel,
    unitsSold: toNumber(row.unitsSold),
    revenue: roundMoney(row.revenue),
    orderCount: toNumber(row.orderCount),
  }));

  return {
    periodDays: opts.days == null || !Number.isFinite(Number(opts.days)) || Number(opts.days) <= 0
      ? null
      : Math.min(Math.max(Math.floor(Number(opts.days)), 1), 3660),
    totals,
    topProducts,
    byBrand,
    byModel,
    byDevice,
  };
}

module.exports = {
  normalizePage,
  normalizeVisitorId,
  recordVisit,
  getSummary,
  getPageStats,
  getDailyStats,
  getSalesAnalytics,
};
