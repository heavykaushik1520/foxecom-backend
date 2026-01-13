
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

    // Sliding Expiration Logic
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    const REFRESH_THRESHOLD = 4 * 60 * 60; // Refresh if less than 4 hours remaining

    if (timeUntilExpiry < REFRESH_THRESHOLD) {
      const newToken = jwt.sign(
        { adminId: decoded.adminId, role: decoded.role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );
      res.setHeader('x-auth-token', newToken);
    }

    if (req.admin.role === 'admin' ) {
      next();
    } else {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
  } catch (error) {
    return res.status(400).json({ message: 'Invalid token.' });
  }
}

module.exports = { isAdmin };
