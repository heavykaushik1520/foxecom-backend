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

module.exports = {
  normalizePage,
  normalizeVisitorId,
  recordVisit,
  getSummary,
  getPageStats,
  getDailyStats,
};
