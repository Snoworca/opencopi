const express = require('express');
const { execSync } = require('child_process');
const config = require('../config');

const router = express.Router();

/**
 * GET /health
 * 서버 상태 확인
 */
router.get('/health', (req, res) => {
  let copilotAvailable = false;

  try {
    execSync(`${config.copilot.cliPath} --version`, { timeout: 5000 });
    copilotAvailable = true;
  } catch (err) {
    copilotAvailable = false;
  }

  res.json({
    status: 'ok',
    version: '1.0.0',
    copilot_available: copilotAvailable,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
