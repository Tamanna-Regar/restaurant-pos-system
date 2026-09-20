const jwt = require('jsonwebtoken');
const User = require('../models/user');

const getToken = (req) => {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
};

const authenticate = async (req, res, next) => {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const secret = process.env.JWT_SECRET_KEY;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'JWT secret is not configured' });
    }

    const payload = jwt.verify(token, secret);
    const user = await User.findById(payload.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User account is inactive or unavailable' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission for this action' });
  }
  next();
};

module.exports = { authenticate, authorize };
