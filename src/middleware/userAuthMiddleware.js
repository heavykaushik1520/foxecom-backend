// src/middleware/userAuthMiddleware.js

const jwt = require('jsonwebtoken');
require('dotenv').config();
function isUser(req, res, next) {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1]; // Extract token part

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // e.g., { userId, role }

    // Sliding Expiration Logic: keep session for 365 days, refresh when less than 30 days left
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;
    const REFRESH_THRESHOLD = THIRTY_DAYS_SEC; // Refresh if less than 30 days remaining

    if (timeUntilExpiry < REFRESH_THRESHOLD) {
      const newToken = jwt.sign(
        { userId: decoded.userId, role: decoded.role },
        process.env.JWT_SECRET,
        { expiresIn: "365d" }
      );
      res.setHeader('x-auth-token', newToken);
    }

    next();
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = { isUser };