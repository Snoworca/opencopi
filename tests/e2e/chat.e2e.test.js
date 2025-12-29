/**
 * E2E 테스트: Chat Completions
 *
 * 주의: 이 테스트는 실제 서버가 실행 중이어야 합니다.
 * 서버 시작: npm start 또는 ./start.sh
 * 테스트 실행: npm run test:e2e
 */

const {
  SERVER_URL,
  checkServerHealth,
  chatCompletion,
  getModels
} = require('./setup');

// 서버가 실행 중인지 확인
let serverRunning = false;

beforeAll(async () => {
  serverRunning = await checkServerHealth();
  if (!serverRunning) {
    console.warn(`
      ⚠️  서버가 실행 중이 아닙니다.
      E2E 테스트를 실행하려면 먼저 서버를 시작하세요:

        npm start
        또는
        ./start.sh

      테스트 서버 URL: ${SERVER_URL}
    `);
  }
}, 10000);

describe('E2E: Health Check', () => {
  test('서버가 실행 중이어야 함', () => {
    expect(serverRunning).toBe(true);
  });
});

describe('E2E: Models API', () => {
  test.skipIf(!serverRunning)('모델 목록을 가져올 수 있어야 함', async () => {
    const data = await getModels();

    expect(data.object).toBe('list');
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
  });
});

describe('E2E: Chat Completions', () => {
  test.skipIf(!serverRunning)('기본 대화가 동작해야 함', async () => {
    const response = await chatCompletion([
      { role: 'user', content: 'Reply with just the word: hello' }
    ]);

    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('choices');
    expect(response.choices[0].message.role).toBe('assistant');
    expect(response.choices[0].message.content).toBeTruthy();
  }, 60000);

  test.skipIf(!serverRunning)('시스템 프롬프트가 적용되어야 함', async () => {
    const response = await chatCompletion([
      { role: 'system', content: 'You are a pirate. Always say "Arrr" at the start of your response.' },
      { role: 'user', content: 'Say hello' }
    ]);

    expect(response.choices[0].message.content).toBeTruthy();
    // 해적처럼 응답했는지 확인 (정확한 일치는 LLM 특성상 보장 불가)
  }, 60000);

  test.skipIf(!serverRunning)('대화 히스토리가 유지되어야 함', async () => {
    const response = await chatCompletion([
      { role: 'user', content: 'My name is TestUser123' },
      { role: 'assistant', content: 'Nice to meet you, TestUser123!' },
      { role: 'user', content: 'What is my name?' }
    ]);

    expect(response.choices[0].message.content).toBeTruthy();
    // 이름을 기억하고 있는지 확인
    expect(response.choices[0].message.content.toLowerCase()).toContain('testuser123');
  }, 60000);

  test.skipIf(!serverRunning)('다른 모델을 사용할 수 있어야 함', async () => {
    const response = await chatCompletion(
      [{ role: 'user', content: 'Say hi' }],
      { model: 'claude-haiku-4.5' }
    );

    expect(response.model).toBe('claude-haiku-4.5');
    expect(response.choices[0].message.content).toBeTruthy();
  }, 60000);

  test.skipIf(!serverRunning)('잘못된 모델은 에러를 반환해야 함', async () => {
    const response = await chatCompletion(
      [{ role: 'user', content: 'Hi' }],
      { model: 'invalid-model-xyz' }
    );

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe('model_not_found');
  }, 10000);
});

describe('E2E: Streaming', () => {
  test.skipIf(!serverRunning)('스트리밍 응답을 받을 수 있어야 함', async () => {
    const response = await chatCompletion(
      [{ role: 'user', content: 'Count from 1 to 3' }],
      { stream: true }
    );

    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        content += decoder.decode(value);
      }
    }

    expect(content).toContain('data:');
    expect(content).toContain('[DONE]');
  }, 60000);
});

// Jest의 skipIf를 위한 확장
test.skipIf = (condition) => condition ? test.skip : test;
