/**
 * Optionally verifies a customer JWT (userId in payload).
 * Does not reject invalid/missing tokens — used for public heartbeat so guests work without auth.
 * Admin tokens use adminId, not userId, so they are ignored for visitor user_id.
 */
const jwt = require('jsonwebtoken');
require('dotenv').config();

function optionalUserAuth(req, res, next) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded && decoded.userId != null) {
      const uid = Number(decoded.userId);
      if (Number.isFinite(uid) && uid > 0) {
        req.visitorAuth = { userId: uid };
      }
    }
  } catch {
    // Invalid or expired token — heartbeat still allowed as guest
  }
  next();
}

module.exports = { optionalUserAuth };
