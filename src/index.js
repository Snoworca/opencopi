const app = require('./server');
const config = require('./config');
const { logger } = require('./utils/logger');
const { preloadModels } = require('./services/modelDiscovery');

const { port, host } = config.server;

// 서버 시작 함수
async function startServer() {
  try {
    // 모델 목록 미리 로드
    const models = await preloadModels();

    app.listen(port, host, () => {
      logger.info(`Copilot Server started on http://${host}:${port}`);
      logger.info(`Default model: ${config.copilot.defaultModel}`);
      logger.info(`Available models: ${models.map(m => m.id).join(', ')}`);

      if (config.security.apiKey) {
        logger.info('API key authentication enabled');
      } else {
        logger.warn('API key authentication disabled - server is open');
      }
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// 서버 시작
startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
