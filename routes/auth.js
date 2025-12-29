const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Simple owner authentication with password
// In production, you might want to use proper user management
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'owner123';

router.post('/owner-login', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Simple password check - in production, use proper user authentication
    if (password === OWNER_PASSWORD) {
      const token = jwt.sign(
        { role: 'owner', timestamp: Date.now() },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        message: 'Owner authentication successful'
      });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify token endpoint
router.post('/verify-token', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.json({ valid: false });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.json({ valid: false });
  }
});

module.exports = router;
