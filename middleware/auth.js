const jwt = require('jsonwebtoken');

const authenticateOwner = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

const requireOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Owner authentication required' });
  }
  next();
};

module.exports = { authenticateOwner, requireOwner };