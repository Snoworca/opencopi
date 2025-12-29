/**
 * E2E 테스트 설정
 * 실제 서버와 Copilot CLI를 사용하여 테스트
 */

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3456';
const API_KEY = process.env.TEST_API_KEY || '';

/**
 * 서버 상태 확인
 */
async function checkServerHealth() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const data = await response.json();
    return data.status === 'ok' && data.copilot_available;
  } catch (err) {
    return false;
  }
}

/**
 * Chat Completion 요청
 */
async function chatCompletion(messages, options = {}) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const body = {
    model: options.model || 'gpt-5-mini',
    messages,
    stream: options.stream || false
  };

  const response = await fetch(`${SERVER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (options.stream) {
    return response;
  }

  return response.json();
}

/**
 * 모델 목록 가져오기
 */
async function getModels() {
  const response = await fetch(`${SERVER_URL}/v1/models`);
  return response.json();
}

module.exports = {
  SERVER_URL,
  API_KEY,
  checkServerHealth,
  chatCompletion,
  getModels
};
