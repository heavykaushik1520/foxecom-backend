
const jwt = require('jsonwebtoken');
require('dotenv').config();


function isAdmin(req, res, next) {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1]; // ⬅️ Only the token part

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;

    // Sliding Expiration Logic: keep session for 365 days, refresh when less than 30 days left
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;
    const REFRESH_THRESHOLD = THIRTY_DAYS_SEC; // Refresh if less than 30 days remaining

    if (timeUntilExpiry < REFRESH_THRESHOLD) {
      const newToken = jwt.sign(
        { adminId: decoded.adminId, role: decoded.role },
        process.env.JWT_SECRET,
        { expiresIn: "365d" }
      );
      res.setHeader('x-auth-token', newToken);
    }

    const role = (req.admin.role && String(req.admin.role).toLowerCase()) || '';
    if (role === 'admin' || role === 'superadmin') {
      next();
    } else if (req.admin.role === undefined || req.admin.role === null) {
      // Legacy token without role – treat as admin so existing sessions still work
      next();
    } else {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
  } catch (error) {
    return res.status(400).json({ message: 'Invalid token.' });
  }
}

function isSuperAdmin(req, res, next) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;
    if (timeUntilExpiry < THIRTY_DAYS_SEC) {
      const newToken = jwt.sign(
        { adminId: decoded.adminId, role: decoded.role },
        process.env.JWT_SECRET,
        { expiresIn: "365d" }
      );
      res.setHeader('x-auth-token', newToken);
    }
    const role = (req.admin.role && String(req.admin.role).toLowerCase()) || '';
    if (role !== 'superadmin') {
      return res.status(403).json({ message: 'Access denied. Super Admin only.' });
    }
    next();
  } catch (error) {
    return res.status(400).json({ message: 'Invalid token.' });
  }
}

module.exports = { isAdmin, isSuperAdmin };
