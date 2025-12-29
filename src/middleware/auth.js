const crypto = require('crypto');
const config = require('../config');

/**
 * API 키 인증 미들웨어
 */
function authMiddleware(req, res, next) {
  const apiKey = config.security.apiKey;

  // API 키가 설정되지 않은 경우 인증 건너뛰기
  if (!apiKey) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: {
        message: 'Missing Authorization header',
        type: 'authentication_error',
        code: 'missing_api_key'
      }
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: {
        message: 'Invalid Authorization header format. Use: Bearer <api_key>',
        type: 'authentication_error',
        code: 'invalid_auth_format'
      }
    });
  }

  const token = parts[1];

  // 타이밍 공격 방지를 위한 상수 시간 비교
  try {
    const tokenBuffer = Buffer.from(token);
    const apiKeyBuffer = Buffer.from(apiKey);

    if (tokenBuffer.length !== apiKeyBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, apiKeyBuffer)) {
      return res.status(401).json({
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          code: 'invalid_api_key'
        }
      });
    }
  } catch (err) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
        code: 'invalid_api_key'
      }
    });
  }

  next();
}

module.exports = authMiddleware;
