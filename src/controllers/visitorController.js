const visitorSessionService = require('../services/visitorSessionService');

function clientIp(req) {
  if (req.ip) return String(req.ip);
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    return xff.split(',')[0].trim().slice(0, 64);
  }
  const socketIp = req.socket?.remoteAddress;
  return socketIp ? String(socketIp).slice(0, 64) : '';
}

/**
 * POST /api/visitor/heartbeat
 * Body: session_id, current_page, product_id? (optional), is_logged_in ignored if JWT present
 */
async function postHeartbeat(req, res) {
  try {
    const body = req.body || {};
    const sessionId = visitorSessionService.normalizeSessionId(body.session_id);
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing session_id (8–100 chars, alphanumeric, underscore, hyphen).',
      });
    }

    const currentPage = visitorSessionService.normalizePage(body.current_page);
    const productId = visitorSessionService.normalizeProductId(body.product_id);

    const resolvedUserId =
      req.visitorAuth && req.visitorAuth.userId != null ? req.visitorAuth.userId : null;

    const userAgent = req.get('user-agent') || null;
    const ip = clientIp(req);

    await visitorSessionService.upsertHeartbeat({
      sessionId,
      resolvedUserId,
      currentPage,
      productId,
      ip,
      userAgent,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('visitor heartbeat:', err);
    return res.status(500).json({ success: false, message: 'Failed to update visitor session' });
  }
}

async function getLiveVisitors(req, res) {
  try {
    const data = await visitorSessionService.getLiveVisitors();
    return res.json({
      success: true,
      onlineWindowMinutes: visitorSessionService.ONLINE_WINDOW_MINUTES,
      totalLiveVisitors: data.totalLiveVisitors,
      totalLoggedInLive: data.totalLoggedInLive,
      totalGuestLive: data.totalGuestLive,
      periodStats: data.periodStats,
      visitors: data.visitors,
    });
  } catch (err) {
    console.error('getLiveVisitors:', err);
    return res.status(500).json({ success: false, message: 'Failed to load live visitors' });
  }
}

async function getProductLiveViewers(req, res) {
  try {
    const { productId } = req.params;
    const result = await visitorSessionService.getProductLiveViewerCount(productId);
    return res.json({
      success: true,
      onlineWindowMinutes: visitorSessionService.ONLINE_WINDOW_MINUTES,
      productId: result.productId,
      liveViewers: result.liveViewers,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('getProductLiveViewers:', err);
    return res.status(status).json({
      success: false,
      message: status === 400 ? err.message : 'Failed to load product live viewers',
    });
  }
}

module.exports = {
  postHeartbeat,
  getLiveVisitors,
  getProductLiveViewers,
};
