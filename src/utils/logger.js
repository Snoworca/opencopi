const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// 로그 디렉토리 생성
const logDir = path.resolve(config.logging.dir);
const requestsLogDir = path.join(logDir, 'requests');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
if (!fs.existsSync(requestsLogDir)) {
  fs.mkdirSync(requestsLogDir, { recursive: true });
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'copilot-server' },
  transports: [
    // 콘솔 출력
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1
            ? ` ${JSON.stringify(meta)}`
            : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
    }),
    // 전체 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    // 에러 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});

// Access 로거 (별도 파일)
const accessLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, message }) => {
      return `${timestamp} ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'access.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

/**
 * Access 로그 기록 (Apache Combined Log Format 스타일)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {number} duration - 응답 시간 (ms)
 */
function logAccess(req, res, duration) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '-';
  const method = req.method;
  const url = req.originalUrl || req.url;
  const status = res.statusCode;
  const userAgent = req.headers['user-agent'] || '-';
  const referer = req.headers['referer'] || '-';
  const contentLength = res.get('content-length') || '-';

  // Combined Log Format: IP - - [timestamp] "METHOD URL HTTP/1.1" STATUS SIZE "REFERER" "USER-AGENT" DURATION
  const logLine = `${ip} - - "${method} ${url} HTTP/1.1" ${status} ${contentLength} "${referer}" "${userAgent}" ${duration}ms`;

  accessLogger.info(logLine);
}

/**
 * 민감정보를 제거한 객체 반환
 */
function sanitizeForLogging(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = ['authorization', 'api_key', 'password', 'token', 'secret'];
  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * 요청 로그를 파일로 저장
 */
async function saveRequestLog(requestLog) {
  if (!config.logging.logRequests) return;

  try {
    const date = new Date().toISOString().split('T')[0];
    const dateDir = path.join(requestsLogDir, date);

    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }

    const filename = `${requestLog.requestId}.json`;
    const filepath = path.join(dateDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(requestLog, null, 2));
    logger.debug(`Request log saved: ${filepath}`);
  } catch (err) {
    logger.error(`Failed to save request log: ${err.message}`);
  }
}

module.exports = { logger, accessLogger, logAccess, sanitizeForLogging, saveRequestLog, logDir, requestsLogDir };
