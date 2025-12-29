const dotenv = require('dotenv');
const path = require('path');

// .env 파일 로드
dotenv.config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [{
    name: 'copilot-server',
    script: 'src/index.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      COPILOT_GITHUB_TOKEN: process.env.COPILOT_GITHUB_TOKEN,
      PORT: process.env.PORT || 22283,
      HOST: process.env.HOST || '0.0.0.0',
      DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'gpt-4.1',
      API_KEY: process.env.API_KEY,
      LOG_LEVEL: process.env.LOG_LEVEL || 'info'
    }
  }]
};
