const { Op, literal } = require("sequelize");
const VisitorSession = require("../models/visitorSession");

/** Visitors with last_seen within this window are considered "live" (must match frontend heartbeat cadence). */
const ONLINE_WINDOW_MINUTES = 2;

const MAX_SESSION_LEN = 100;
const MAX_PAGE_LEN = 255;
const MAX_UA_LEN = 8000;

function onlineWhereClause() {
  return literal(
    `last_seen >= DATE_SUB(NOW(), INTERVAL ${ONLINE_WINDOW_MINUTES} MINUTE)`
  );
}

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "bigint") return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSessionId(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length < 8 || s.length > MAX_SESSION_LEN) return null;
  if (!/^[0-9a-zA-Z_-]+$/.test(s)) return null;
  return s;
}

function normalizePage(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "/";
  let p = raw.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  return p.length > MAX_PAGE_LEN ? p.slice(0, MAX_PAGE_LEN) : p;
}

function normalizeProductId(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function truncateUa(ua) {
  if (typeof ua !== "string" || !ua) return null;
  return ua.length > MAX_UA_LEN ? ua.slice(0, MAX_UA_LEN) : ua;
}

function truncateIp(ip) {
  if (typeof ip !== "string" || !ip) return null;
  return ip.slice(0, 45);
}

function mapRow(row) {
  if (!row) return null;
  const r = row.get ? row.get({ plain: true }) : row;
  return {
    id: toNumber(r.id),
    session_id: r.session_id,
    user_id: r.user_id != null ? String(r.user_id) : null,
    current_page: r.current_page,
    product_id: r.product_id != null ? toNumber(r.product_id) : null,
    is_logged_in: r.is_logged_in === 1 || r.is_logged_in === true,
    ip_address: r.ip_address || null,
    user_agent: r.user_agent || null,
    last_seen: r.last_seen,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function startOfWeek(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // week starts Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYear(now = new Date()) {
  return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
}

async function getPeriodCount(startDate) {
  const [total, loggedIn] = await Promise.all([
    VisitorSession.count({
      where: {
        last_seen: { [Op.gte]: startDate },
      },
    }),
    VisitorSession.count({
      where: {
        [Op.and]: [{ last_seen: { [Op.gte]: startDate } }, { is_logged_in: true }],
      },
    }),
  ]);
  const guest = Math.max(0, (total || 0) - (loggedIn || 0));
  return { total: total || 0, loggedIn: loggedIn || 0, guest };
}

async function getPeriodStats() {
  const now = new Date();
  const [today, week, month, year] = await Promise.all([
    getPeriodCount(startOfToday(now)),
    getPeriodCount(startOfWeek(now)),
    getPeriodCount(startOfMonth(now)),
    getPeriodCount(startOfYear(now)),
  ]);
  return { today, week, month, year };
}

/**
 * Upsert session by session_id (unique). Trust user_id only from verified JWT (passed as resolvedUserId).
 * @param {{ sessionId: string, resolvedUserId: number | null, currentPage: string, productId: number | null, ip: string, userAgent: string | null }} params
 */
async function upsertHeartbeat({
  sessionId,
  resolvedUserId,
  currentPage,
  productId,
  ip,
  userAgent,
}) {
  const isLoggedIn = !!resolvedUserId;
  const userId = resolvedUserId != null ? resolvedUserId : null;
  const now = new Date();

  const payload = {
    user_id: userId,
    current_page: currentPage,
    product_id: productId,
    is_logged_in: isLoggedIn,
    ip_address: truncateIp(ip),
    user_agent: truncateUa(userAgent),
    last_seen: now,
  };
  try {
    // Atomic on MySQL (INSERT ... ON DUPLICATE KEY UPDATE) in Sequelize.
    await VisitorSession.upsert({
      session_id: sessionId,
      ...payload,
    });
  } catch (err) {
    // Safety fallback for environments where upsert path still races.
    if (err?.name === "SequelizeUniqueConstraintError") {
      await VisitorSession.update(payload, {
        where: { session_id: sessionId },
      });
      return;
    }
    throw err;
  }
}

async function getLiveVisitors() {
  const baseWhere = onlineWhereClause();

  const [totalLive, loggedInLive, rows, periodStats] = await Promise.all([
    VisitorSession.count({
      where: baseWhere,
    }),
    VisitorSession.count({
      where: {
        [Op.and]: [baseWhere, { is_logged_in: true }],
      },
    }),
    VisitorSession.findAll({
      where: baseWhere,
      order: [["last_seen", "DESC"]],
      limit: 500,
    }),
    getPeriodStats(),
  ]);

  return {
    totalLiveVisitors: totalLive,
    totalLoggedInLive: loggedInLive,
    totalGuestLive: Math.max(0, (totalLive || 0) - (loggedInLive || 0)),
    periodStats,
    visitors: rows.map(mapRow),
  };
}

async function getProductLiveViewerCount(productId) {
  const n = normalizeProductId(productId);
  if (n == null) {
    const err = new Error("Invalid product id");
    err.statusCode = 400;
    throw err;
  }

  const cnt = await VisitorSession.count({
    where: {
      [Op.and]: [onlineWhereClause(), { product_id: n }],
    },
  });

  return { productId: n, liveViewers: cnt ?? 0 };
}

module.exports = {
  ONLINE_WINDOW_MINUTES,
  normalizeSessionId,
  normalizePage,
  normalizeProductId,
  upsertHeartbeat,
  getLiveVisitors,
  getProductLiveViewerCount,
};
