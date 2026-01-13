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

    // Sliding Expiration Logic
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const timeUntilExpiry = decoded.exp - now;
    const REFRESH_THRESHOLD = 4 * 60 * 60; // Refresh if less than 4 hours remaining

    if (timeUntilExpiry < REFRESH_THRESHOLD) {
      const newToken = jwt.sign(
        { userId: decoded.userId, role: decoded.role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );
      // Send new token in header
      res.setHeader('x-auth-token', newToken);
    }

    next();
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = { isUser };