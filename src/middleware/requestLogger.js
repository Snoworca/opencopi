const { v4: uuidv4 } = require('uuid');
const { logger, saveRequestLog } = require('../utils/logger');
const config = require('../config');

/**
 * 요청 로깅 미들웨어
 * 요청 ID를 생성하고, 요청/응답 정보를 로깅
 */
function requestLogger(req, res, next) {
  const requestId = `req-${uuidv4().substring(0, 12)}`;
  const startTime = Date.now();

  // 요청 ID를 req에 저장 (다른 곳에서 사용)
  req.requestId = requestId;

  // 요청 로그 객체 초기화
  req.requestLog = {
    requestId,
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      path: req.path,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    }
  };

  // 요청 본문 로깅 (설정에 따라)
  if (config.logging.logRequestBody && req.body) {
    req.requestLog.request.body = req.body;
  }

  // 응답 완료 시 로깅
  const originalEnd = res.end;
  let responseBody = '';

  // 응답 본문 캡처 (비스트리밍)
  if (config.logging.logResponseBody) {
    const originalWrite = res.write;
    res.write = function(chunk, ...args) {
      if (chunk) {
        responseBody += chunk.toString();
      }
      return originalWrite.apply(res, [chunk, ...args]);
    };
  }

  res.end = function(chunk, ...args) {
    if (chunk && config.logging.logResponseBody) {
      responseBody += chunk.toString();
    }

    const duration = Date.now() - startTime;

    // 응답 정보 추가
    req.requestLog.response = {
      status: res.statusCode,
      duration
    };

    if (config.logging.logResponseBody && responseBody) {
      try {
        req.requestLog.response.body = JSON.parse(responseBody);
      } catch {
        req.requestLog.response.body = responseBody.substring(0, 1000);
      }
    }

    // tempDir 정보가 있으면 추가
    if (req.tempDir) {
      req.requestLog.tempDir = req.tempDir;
    }

    // 로그 저장
    saveRequestLog(req.requestLog);

    // 콘솔 로그
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
      requestId
    });

    return originalEnd.apply(res, [chunk, ...args]);
  };

  next();
}

module.exports = requestLogger;
