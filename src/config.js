require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3456,
    host: process.env.HOST || '0.0.0.0'
  },

  copilot: {
    defaultModel: process.env.DEFAULT_MODEL || 'gpt-4.1',
    cliPath: process.env.COPILOT_CLI_PATH || 'copilot',
    timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 300000,
    tempDirBase: process.env.TEMP_DIR_BASE || '/tmp'
  },

  security: {
    apiKey: process.env.API_KEY || null,
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) : ['*']
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
    logRequests: process.env.LOG_REQUESTS !== 'false',
    logRequestBody: process.env.LOG_REQUEST_BODY === 'true',
    logResponseBody: process.env.LOG_RESPONSE_BODY === 'true'
  }

  // 모델 목록은 modelDiscovery 서비스에서 동적으로 탐색됨
  // src/services/modelDiscovery.js 참조
};

module.exports = config;
