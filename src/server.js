const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');
const authMiddleware = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimit');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// CORS 설정
const corsOptions = {
  origin: config.security.corsOrigins.includes('*')
    ? '*'
    : config.security.corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// JSON 파싱
app.use(express.json({ limit: '10mb' }));

// 요청 로깅 (요청/응답/tempDir 기록)
app.use(requestLogger);

// Rate Limiting
app.use(rateLimiter);

// 인증
app.use(authMiddleware);

// 라우트
app.use(routes);

// 404 핸들러
app.use(notFoundHandler);

// 에러 핸들러
app.use(errorHandler);

module.exports = app;
