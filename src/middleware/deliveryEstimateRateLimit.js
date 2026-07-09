/**
 * Simple in-memory rate limiter for public shipping estimate endpoints.
 */
const WINDOW_MS = Number(process.env.DELIVERY_ESTIMATE_RATE_WINDOW_MS) || 60_000;
const MAX_REQUESTS = Number(process.env.DELIVERY_ESTIMATE_RATE_MAX) || 40;

const buckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function deliveryEstimateRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: "Too many delivery estimate requests. Please try again shortly.",
    });
  }

  if (buckets.size > 10000) {
    const cutoff = now;
    for (const [key, value] of buckets.entries()) {
      if (value.resetAt < cutoff) buckets.delete(key);
    }
  }

  return next();
}

module.exports = { deliveryEstimateRateLimit };
