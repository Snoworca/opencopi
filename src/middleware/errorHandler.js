const { logger } = require('../utils/logger');

/**
 * 전역 에러 핸들러 미들웨어
 */
function errorHandler(err, req, res, next) {
  // 이미 응답이 시작된 경우 (스트리밍)
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const errorResponse = {
    error: {
      message: err.message || 'Internal server error',
      type: err.type || 'internal_error',
      code: err.code || 'unknown_error'
    }
  };

  if (err.param) {
    errorResponse.error.param = err.param;
  }

  // 로깅 (민감정보 제외)
  logger.error('Request error', {
    status,
    type: errorResponse.error.type,
    code: errorResponse.error.code,
    message: errorResponse.error.message,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  res.status(status).json(errorResponse);
}

/**
 * 404 핸들러
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Endpoint not found: ${req.method} ${req.path}`,
      type: 'not_found',
      code: 'endpoint_not_found'
    }
  });
}

module.exports = { errorHandler, notFoundHandler };
