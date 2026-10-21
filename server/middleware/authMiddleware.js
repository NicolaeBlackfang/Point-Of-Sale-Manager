const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT and load the active user
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      if (req.user.isActive === false) {
        return res.status(403).json({ message: 'Account is deactivated' });
      }

      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized' });
    }
  }

  return res.status(401).json({ message: 'Not authorized' });
};

// Role Authorization Middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
};

module.exports = { protect, authorize };
