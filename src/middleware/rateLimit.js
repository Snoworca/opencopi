const rateLimit = require('express-rate-limit');
const config = require('../config');

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        message: 'Too many requests, please try again later',
        type: 'rate_limit_exceeded',
        code: 'rate_limit_exceeded'
      }
    });
  },
  keyGenerator: (req) => {
    // IP 기반 rate limiting
    return req.ip || req.headers['x-forwarded-for'] || 'unknown';
  }
});

module.exports = limiter;
