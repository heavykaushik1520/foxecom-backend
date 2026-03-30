const analyticsService = require('../services/analyticsService');

function clientIp(req) {
  if (req.ip) return String(req.ip);
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    return xff.split(',')[0].trim().slice(0, 64);
  }
  const socketIp = req.socket?.remoteAddress;
  return socketIp ? String(socketIp).slice(0, 64) : '';
}

async function recordVisit(req, res) {
  try {
    const { visitorId, page } = req.body || {};
    const userAgent = req.get('user-agent') || null;
    const ip = clientIp(req);

    await analyticsService.recordVisit({
      visitorId,
      page,
      ip,
      userAgent,
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('analytics recordVisit:', err);
    }
    return res.status(status).json({
      success: false,
      message: status === 400 ? err.message : 'Failed to record visit',
    });
  }
}

async function getSummary(req, res) {
  try {
    const summary = await analyticsService.getSummary();
    return res.json(summary);
  } catch (err) {
    console.error('analytics getSummary:', err);
    return res.status(500).json({ message: 'Failed to load analytics summary' });
  }
}

async function getPageStats(req, res) {
  try {
    const pages = await analyticsService.getPageStats();
    return res.json(pages);
  } catch (err) {
    console.error('analytics getPageStats:', err);
    return res.status(500).json({ message: 'Failed to load page analytics' });
  }
}

async function getDailyStats(req, res) {
  try {
    const days = req.query.days;
    const daily = await analyticsService.getDailyStats(days);
    return res.json(daily);
  } catch (err) {
    console.error('analytics getDailyStats:', err);
    return res.status(500).json({ message: 'Failed to load daily analytics' });
  }
}

async function getSalesAnalytics(req, res) {
  try {
    const rawDays = req.query.days;
    let days = null;
    if (rawDays !== undefined && rawDays !== null && rawDays !== '' && String(rawDays).toLowerCase() !== 'all') {
      const n = parseInt(rawDays, 10);
      if (Number.isFinite(n) && n > 0) days = n;
    }
    const limit = req.query.limit;
    const data = await analyticsService.getSalesAnalytics({ days, limit });
    return res.json(data);
  } catch (err) {
    console.error('analytics getSalesAnalytics:', err);
    return res.status(500).json({ message: 'Failed to load sales analytics' });
  }
}

module.exports = {
  recordVisit,
  getSummary,
  getPageStats,
  getDailyStats,
  getSalesAnalytics,
};
