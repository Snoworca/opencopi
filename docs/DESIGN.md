# Copilot Server - OpenAI API 호환 서버 설계 문서

> **버전**: 2.1
> **최종 수정**: 2024-12-29
> **상태**: 승인됨

---

## 1. 개요

### 1.1 프로젝트 목표
GitHub Copilot CLI를 래핑하여 OpenAI API와 완전히 호환되는 REST API 서버를 구현한다.

### 1.2 핵심 요구사항
| 요구사항 | 우선순위 | 상태 |
|----------|----------|------|
| OpenAI Chat Completions API 형식 완전 호환 | 필수 | 설계 완료 |
| 다중 모델 지원 (Claude, GPT, Gemini) | 필수 | 설계 완료 |
| 스트리밍 모드 지원 | 필수 | 설계 완료 |
| 비스트리밍 모드 지원 | 필수 | 설계 완료 |
| 시스템 프롬프트 지원 | 필수 | 설계 완료 |
| 환경 변수 기반 설정 | 필수 | 설계 완료 |
| API 인증 | 선택 | 설계 완료 |
| Rate Limiting | 선택 | 설계 완료 |

### 1.3 지원 모델 (동적 탐색)

모델 목록은 Copilot CLI에서 **동적으로 탐색**됩니다:

```bash
# 잘못된 모델 입력 시 허용된 모델 목록 반환
copilot --model invalid 2>&1
# error: option '--model <model>' argument 'invalid' is invalid.
# Allowed choices are claude-sonnet-4.5, claude-haiku-4.5, ...
```

**탐색 방식:**
1. 서버 시작 시 Copilot CLI를 호출하여 모델 목록 획득
2. "Allowed choices are" 뒤의 쉼표 구분 목록 파싱
3. 결과를 캐싱하여 반복 호출 방지
4. CLI 호출 실패 시 폴백 목록 사용

**현재 지원 모델 (2024-12-29 기준):**

| 모델 ID | 제공사 |
|---------|--------|
| claude-sonnet-4.5 | Anthropic |
| claude-haiku-4.5 | Anthropic |
| claude-opus-4.5 | Anthropic |
| claude-sonnet-4 | Anthropic |
| gpt-5.1-codex-max | OpenAI |
| gpt-5.1-codex | OpenAI |
| gpt-5.2 | OpenAI |
| gpt-5.1 | OpenAI |
| gpt-5 | OpenAI |
| gpt-5.1-codex-mini | OpenAI |
| gpt-5-mini | OpenAI |
| gpt-4.1 | OpenAI |
| gemini-3-pro-preview | Google |

### 1.4 핵심 발견사항 (연구 결과)

연구를 통해 확인된 Copilot CLI 동작:

```bash
# 시스템 프롬프트: AGENTS.md 파일을 통해 주입
echo "You are a pirate." > AGENTS.md
copilot -p "Say hello" --silent --allow-all-tools
# 결과: "Ahoy there, ye scallywag!"

# 스트리밍: stdout으로 청크 단위 출력 (Node.js에서 확인됨)
# [7569ms] STDOUT: Ah
# [7624ms] STDOUT: oy,
# ...

# 비스트리밍: --stream off 옵션
copilot -p "..." --stream off --silent --allow-all-tools
```

---

## 2. 아키텍처

### 2.1 시스템 구성도

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client (OpenAI SDK Compatible)               │
│         Python openai / Node.js openai / curl / etc.            │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP/HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Copilot Proxy Server                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Middleware Stack                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │   │
│  │  │  CORS    │→│  Auth    │→│  Rate    │→│   Logger    │ │   │
│  │  │          │ │  Check   │ │  Limit   │ │             │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                      Router                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ GET         │  │ POST        │  │ GET             │   │   │
│  │  │ /v1/models  │  │ /v1/chat/   │  │ /health         │   │   │
│  │  │             │  │ completions │  │                 │   │   │
│  │  └─────────────┘  └──────┬──────┘  └─────────────────┘   │   │
│  └──────────────────────────┼───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                  Request Handler                          │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐    │   │
│  │  │ RequestValidator│  │ MessageTransformer          │    │   │
│  │  │ - model check   │  │ - system → AGENTS.md        │    │   │
│  │  │ - schema valid  │  │ - messages → prompt text    │    │   │
│  │  └─────────────────┘  └─────────────────────────────┘    │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                  Copilot Executor                         │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐    │   │
│  │  │ TempDirManager  │  │ ProcessManager              │    │   │
│  │  │ - create        │  │ - spawn copilot             │    │   │
│  │  │ - cleanup       │  │ - stream stdout             │    │   │
│  │  │ - write AGENTS  │  │ - handle timeout            │    │   │
│  │  └─────────────────┘  └─────────────────────────────┘    │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                  Response Formatter                       │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐    │   │
│  │  │ NonStreamFormat │  │ SSEStreamFormat             │    │   │
│  │  │ - JSON response │  │ - chunked SSE               │    │   │
│  │  │ - usage stats   │  │ - data: [DONE]              │    │   │
│  │  └─────────────────┘  └─────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Copilot CLI                          │
│   copilot -p "..." --model X --silent --allow-all-tools         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 컴포넌트 상세

#### 2.2.1 Middleware Stack

| 미들웨어 | 역할 | 구현 |
|----------|------|------|
| CORS | Cross-Origin 요청 허용 | `cors` 패키지 |
| Auth | API 키 검증 | 커스텀 미들웨어 |
| RateLimit | 요청 속도 제한 | `express-rate-limit` |
| Logger | 요청/응답 로깅 | `morgan` + 커스텀 |
| ErrorHandler | 전역 에러 처리 | 커스텀 미들웨어 |

#### 2.2.2 TempDirManager

```javascript
class TempDirManager {
  constructor(baseDir = '/tmp') {
    this.baseDir = baseDir;
  }

  async create() {
    const id = crypto.randomUUID();
    const dir = path.join(this.baseDir, `copilot-${id}`);
    await fs.mkdir(dir, { recursive: true });
    return { id, dir };
  }

  async writeAgentsFile(dir, systemPrompt) {
    if (!systemPrompt) return;
    const filePath = path.join(dir, 'AGENTS.md');
    await fs.writeFile(filePath, systemPrompt, 'utf-8');
  }

  async cleanup(dir) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (err) {
      logger.warn(`Failed to cleanup ${dir}: ${err.message}`);
    }
  }
}
```

#### 2.2.3 ModelDiscovery

```javascript
/**
 * Copilot CLI에서 사용 가능한 모델 목록을 동적으로 탐색
 */
class ModelDiscovery {
  constructor(copilotPath = 'copilot') {
    this.copilotPath = copilotPath;
    this.cachedModels = null;
  }

  /**
   * 모델 목록 조회 (캐싱)
   */
  async getModels() {
    if (this.cachedModels) {
      return this.cachedModels;
    }

    try {
      const models = await this.discoverModels();
      this.cachedModels = models;
      return models;
    } catch (error) {
      // 폴백: 정적 목록 반환
      return this.getFallbackModels();
    }
  }

  /**
   * CLI 호출하여 모델 목록 파싱
   */
  async discoverModels() {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.copilotPath, ['--model', 'invalid-model']);
      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', () => {
        // "Allowed choices are X, Y, Z." 패턴 파싱
        const match = stderr.match(/Allowed choices are (.+)\./);
        if (match) {
          const modelIds = match[1].split(',').map(m => m.trim());
          const models = modelIds.map(id => ({
            id,
            owned_by: this.inferOwner(id)
          }));
          resolve(models);
        } else {
          reject(new Error('Failed to parse model list'));
        }
      });
    });
  }

  /**
   * 모델 ID로 제공사 추론
   */
  inferOwner(modelId) {
    if (modelId.startsWith('claude')) return 'anthropic';
    if (modelId.startsWith('gpt')) return 'openai';
    if (modelId.startsWith('gemini')) return 'google';
    return 'unknown';
  }
}
```

#### 2.2.4 ProcessManager

```javascript
class ProcessManager {
  constructor(config) {
    this.timeout = config.timeout || 300000;
    this.copilotPath = config.copilotPath || 'copilot';
  }

  spawn(options) {
    const { prompt, model, stream, cwd } = options;

    const args = [
      '-p', prompt,
      '--model', model,
      '--silent',
      '--allow-all-tools',
      '--stream', stream ? 'on' : 'off'
    ];

    return child_process.spawn(this.copilotPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: this.timeout
    });
  }
}
```

---

## 3. API 명세

### 3.1 POST /v1/chat/completions

#### 요청 스키마

```typescript
interface ChatCompletionRequest {
  model: string;                    // 필수: 모델 ID
  messages: Message[];              // 필수: 메시지 배열
  stream?: boolean;                 // 선택: 스트리밍 모드 (기본: false)
  temperature?: number;             // 무시됨 (Copilot CLI 미지원)
  max_tokens?: number;              // 무시됨 (Copilot CLI 미지원)
  top_p?: number;                   // 무시됨
  frequency_penalty?: number;       // 무시됨
  presence_penalty?: number;        // 무시됨
  stop?: string | string[];         // 무시됨
  user?: string;                    // 무시됨
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

#### 요청 예시

```json
{
  "model": "claude-opus-4.5",
  "messages": [
    {"role": "system", "content": "You are a helpful coding assistant."},
    {"role": "user", "content": "Hello!"},
    {"role": "assistant", "content": "Hi there! How can I help you today?"},
    {"role": "user", "content": "Write a hello world in Python"}
  ],
  "stream": false
}
```

#### 응답 (비스트리밍)

```json
{
  "id": "chatcmpl-copilot-a1b2c3d4",
  "object": "chat.completion",
  "created": 1703980800,
  "model": "claude-opus-4.5",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here's a simple Hello World program in Python:\n\n```python\nprint(\"Hello, World!\")\n```"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": -1,
    "completion_tokens": -1,
    "total_tokens": -1
  }
}
```

> **참고**: Copilot CLI는 토큰 사용량을 제공하지 않으므로 `-1`로 표시

#### 응답 (스트리밍)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"id":"chatcmpl-copilot-a1b2c3d4","object":"chat.completion.chunk","created":1703980800,"model":"claude-opus-4.5","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-copilot-a1b2c3d4","object":"chat.completion.chunk","created":1703980800,"model":"claude-opus-4.5","choices":[{"index":0,"delta":{"content":"Here's"},"finish_reason":null}]}

data: {"id":"chatcmpl-copilot-a1b2c3d4","object":"chat.completion.chunk","created":1703980800,"model":"claude-opus-4.5","choices":[{"index":0,"delta":{"content":" a"},"finish_reason":null}]}

data: {"id":"chatcmpl-copilot-a1b2c3d4","object":"chat.completion.chunk","created":1703980800,"model":"claude-opus-4.5","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### 3.2 GET /v1/models

#### 응답

```json
{
  "object": "list",
  "data": [
    {
      "id": "claude-opus-4.5",
      "object": "model",
      "created": 1703980800,
      "owned_by": "anthropic"
    },
    {
      "id": "gpt-5",
      "object": "model",
      "created": 1703980800,
      "owned_by": "openai"
    }
  ]
}
```

### 3.3 GET /health

#### 응답

```json
{
  "status": "ok",
  "version": "1.0.0",
  "copilot_available": true,
  "timestamp": "2024-12-29T12:00:00.000Z"
}
```

---

## 4. 메시지 변환 로직

### 4.1 전체 변환 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenAI Messages                          │
│  [                                                          │
│    {role: "system", content: "You are helpful..."},        │
│    {role: "user", content: "Hello"},                        │
│    {role: "assistant", content: "Hi!"},                     │
│    {role: "user", content: "How are you?"}                  │
│  ]                                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   MessageTransformer                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. Extract system messages → AGENTS.md                  │  │
│  │    "You are helpful..."                                 │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 2. Convert conversation → prompt text                   │  │
│  │    "Previous conversation:                              │  │
│  │     User: Hello                                         │  │
│  │     Assistant: Hi!                                      │  │
│  │                                                         │  │
│  │     Current request:                                    │  │
│  │     How are you?"                                       │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 구현 코드

```javascript
class MessageTransformer {
  /**
   * OpenAI messages 배열을 Copilot CLI 입력으로 변환
   * @param {Message[]} messages - OpenAI 형식 메시지 배열
   * @returns {{ systemPrompt: string, prompt: string }}
   */
  transform(messages) {
    // 1. 시스템 메시지 추출
    const systemMessages = messages.filter(m => m.role === 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

    // 2. 대화 메시지 추출
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // 3. 프롬프트 생성
    const prompt = this.buildPrompt(conversationMessages);

    return { systemPrompt, prompt };
  }

  /**
   * 대화 메시지를 프롬프트 텍스트로 변환
   */
  buildPrompt(messages) {
    if (messages.length === 0) {
      return '';
    }

    // 단일 user 메시지인 경우 직접 반환
    if (messages.length === 1 && messages[0].role === 'user') {
      return messages[0].content;
    }

    // 여러 메시지가 있는 경우
    const parts = [];
    const lastIndex = messages.length - 1;

    // 마지막 메시지를 제외한 히스토리
    if (lastIndex > 0) {
      parts.push('Previous conversation:');
      for (let i = 0; i < lastIndex; i++) {
        const msg = messages[i];
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        parts.push(`${role}: ${msg.content}`);
      }
      parts.push('');
      parts.push('Current request:');
    }

    // 마지막 메시지 (항상 user여야 함)
    const lastMessage = messages[lastIndex];
    parts.push(lastMessage.content);

    return parts.join('\n');
  }
}
```

### 4.3 변환 예시

| 입력 | 출력 |
|------|------|
| `[{role:"user", content:"Hi"}]` | `"Hi"` |
| `[{role:"system", content:"Be helpful"}, {role:"user", content:"Hi"}]` | AGENTS.md: `"Be helpful"`, Prompt: `"Hi"` |
| 복잡한 대화 | 아래 참조 |

**복잡한 대화 변환 예시:**

```javascript
// 입력
[
  { role: "system", content: "You are a Python expert." },
  { role: "user", content: "What is a list?" },
  { role: "assistant", content: "A list is a collection..." },
  { role: "user", content: "Show me an example" }
]

// 출력
// AGENTS.md:
"You are a Python expert."

// Prompt:
`Previous conversation:
User: What is a list?
Assistant: A list is a collection...

Current request:
Show me an example`
```

---

## 5. 설정

### 5.1 환경 변수 (.env)

```env
#============================================
# Server Configuration
#============================================

# 서버 포트 (기본: 3456)
PORT=3456

# 서버 바인딩 주소 (기본: 0.0.0.0)
HOST=0.0.0.0

#============================================
# Copilot CLI Configuration
#============================================

# 기본 모델 (요청에 model이 없을 때 사용)
DEFAULT_MODEL=gpt-5-mini

# Copilot CLI 실행 경로 (기본: copilot)
COPILOT_CLI_PATH=copilot

# 요청 타임아웃 (밀리초, 기본: 300000 = 5분)
REQUEST_TIMEOUT=300000

# 임시 디렉토리 기본 경로 (기본: /tmp)
TEMP_DIR_BASE=/tmp

#============================================
# Security
#============================================

# API 키 (설정 시 Authorization: Bearer {KEY} 필요)
# 비어있으면 인증 없이 사용
API_KEY=

# CORS 허용 출처 (쉼표 구분, * = 모두 허용)
CORS_ORIGINS=*

#============================================
# Rate Limiting
#============================================

# 윈도우당 최대 요청 수 (기본: 100)
RATE_LIMIT_MAX=100

# Rate limit 윈도우 (밀리초, 기본: 60000 = 1분)
RATE_LIMIT_WINDOW=60000

#============================================
# Logging
#============================================

# 로그 레벨 (debug, info, warn, error)
LOG_LEVEL=info

# 요청 본문 로깅 (true/false, 주의: 민감정보 노출 가능)
LOG_REQUEST_BODY=false
```

### 5.2 설정 로드 코드

```javascript
// src/config.js
require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3456,
    host: process.env.HOST || '0.0.0.0'
  },

  copilot: {
    defaultModel: process.env.DEFAULT_MODEL || 'gpt-5-mini',
    cliPath: process.env.COPILOT_CLI_PATH || 'copilot',
    timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 300000,
    tempDirBase: process.env.TEMP_DIR_BASE || '/tmp'
  },

  security: {
    apiKey: process.env.API_KEY || null,
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*']
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logRequestBody: process.env.LOG_REQUEST_BODY === 'true'
  },

  models: [
    { id: 'claude-sonnet-4.5', owned_by: 'anthropic' },
    { id: 'claude-haiku-4.5', owned_by: 'anthropic' },
    { id: 'claude-opus-4.5', owned_by: 'anthropic' },
    { id: 'claude-sonnet-4', owned_by: 'anthropic' },
    { id: 'gpt-5.1-codex-max', owned_by: 'openai' },
    { id: 'gpt-5.1-codex', owned_by: 'openai' },
    { id: 'gpt-5.2', owned_by: 'openai' },
    { id: 'gpt-5.1', owned_by: 'openai' },
    { id: 'gpt-5', owned_by: 'openai' },
    { id: 'gpt-5.1-codex-mini', owned_by: 'openai' },
    { id: 'gpt-5-mini', owned_by: 'openai' },
    { id: 'gpt-4.1', owned_by: 'openai' },
    { id: 'gemini-3-pro-preview', owned_by: 'google' }
  ]
};

module.exports = config;
```

---

## 6. 에러 처리

### 6.1 에러 분류

| 카테고리 | HTTP Status | 에러 타입 | 원인 |
|----------|-------------|-----------|------|
| 클라이언트 에러 | 400 | invalid_request_error | 잘못된 요청 형식 |
| 인증 에러 | 401 | authentication_error | API 키 누락/불일치 |
| 리소스 에러 | 404 | not_found | 모델/엔드포인트 없음 |
| 속도 제한 | 429 | rate_limit_exceeded | 요청 한도 초과 |
| 서버 에러 | 500 | internal_error | 서버 내부 오류 |
| 서비스 에러 | 503 | service_unavailable | Copilot CLI 실행 실패 |
| 타임아웃 | 504 | timeout_error | 요청 시간 초과 |

### 6.2 에러 응답 형식

```json
{
  "error": {
    "message": "상세 에러 메시지",
    "type": "에러 타입",
    "code": "에러 코드",
    "param": "문제가 된 파라미터 (선택)"
  }
}
```

### 6.3 Copilot CLI 에러 패턴

| CLI 출력 패턴 | 매핑 에러 | 조치 |
|---------------|-----------|------|
| `Error: Model not found` | 404 model_not_found | 모델 ID 확인 |
| `Error: Authentication failed` | 503 copilot_auth_error | GitHub 인증 확인 |
| `Error: Rate limited` | 429 copilot_rate_limited | 재시도 대기 |
| `SIGTERM` / `SIGKILL` | 504 timeout_error | 타임아웃 조정 |
| 기타 비정상 종료 | 500 copilot_execution_error | 로그 확인 |

### 6.4 재시도 전략

```javascript
class RetryStrategy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 10000;
  }

  async execute(fn) {
    let lastError;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 재시도 불가능한 에러
        if (!this.isRetryable(error)) {
          throw error;
        }

        // 재시도 대기
        const delay = Math.min(
          this.baseDelay * Math.pow(2, attempt),
          this.maxDelay
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  isRetryable(error) {
    // 일시적 에러만 재시도
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
    return retryableCodes.includes(error.code);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 6.5 에러 핸들러 미들웨어

```javascript
// src/middleware/errorHandler.js
function errorHandler(err, req, res, next) {
  // 이미 응답이 시작된 경우 (스트리밍)
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
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
  logger.error({
    status,
    type: errorResponse.error.type,
    code: errorResponse.error.code,
    message: errorResponse.error.message,
    path: req.path,
    method: req.method
  });

  res.status(status).json(errorResponse);
}
```

---

## 7. 보안

### 7.1 인증 미들웨어

```javascript
// src/middleware/auth.js
function authMiddleware(req, res, next) {
  const apiKey = config.security.apiKey;

  // API 키가 설정되지 않은 경우 인증 건너뛰기
  if (!apiKey) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: {
        message: 'Missing Authorization header',
        type: 'authentication_error',
        code: 'missing_api_key'
      }
    });
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: {
        message: 'Invalid Authorization header format. Use: Bearer <api_key>',
        type: 'authentication_error',
        code: 'invalid_auth_format'
      }
    });
  }

  // 타이밍 공격 방지를 위한 상수 시간 비교
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(apiKey))) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
        code: 'invalid_api_key'
      }
    });
  }

  next();
}
```

### 7.2 입력 검증

```javascript
// src/middleware/validateRequest.js
const Joi = require('joi');

const messageSchema = Joi.object({
  role: Joi.string().valid('system', 'user', 'assistant').required(),
  content: Joi.string().required()
});

const chatCompletionSchema = Joi.object({
  model: Joi.string().required(),
  messages: Joi.array().items(messageSchema).min(1).required(),
  stream: Joi.boolean().default(false),
  // 무시되지만 허용하는 필드들
  temperature: Joi.number().min(0).max(2),
  max_tokens: Joi.number().integer().positive(),
  top_p: Joi.number().min(0).max(1),
  frequency_penalty: Joi.number(),
  presence_penalty: Joi.number(),
  stop: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string())),
  user: Joi.string()
});

function validateChatCompletion(req, res, next) {
  const { error, value } = chatCompletionSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: {
        message: error.details[0].message,
        type: 'invalid_request_error',
        code: 'validation_error',
        param: error.details[0].path.join('.')
      }
    });
  }

  // 모델 화이트리스트 검증
  const validModels = config.models.map(m => m.id);
  if (!validModels.includes(value.model)) {
    return res.status(404).json({
      error: {
        message: `Model '${value.model}' not found`,
        type: 'not_found',
        code: 'model_not_found',
        param: 'model'
      }
    });
  }

  req.validatedBody = value;
  next();
}
```

### 7.3 Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        message: 'Too many requests, please try again later',
        type: 'rate_limit_exceeded',
        code: 'rate_limit_exceeded'
      }
    });
  }
});
```

### 7.4 프롬프트 인젝션 방지

```javascript
/**
 * 쉘 명령 인젝션 방지
 * child_process.spawn 사용으로 쉘 해석 없이 직접 실행
 */
function sanitizeForShell(input) {
  // spawn은 쉘을 거치지 않으므로 기본적으로 안전
  // 하지만 null bytes 등 제거
  return input.replace(/\0/g, '');
}
```

### 7.5 민감정보 로깅 방지

```javascript
function sanitizeForLogging(obj) {
  const sensitiveKeys = ['authorization', 'api_key', 'password', 'token'];
  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}
```

---

## 8. 테스트 전략

### 8.1 테스트 피라미드

```
         ┌─────────────┐
         │    E2E      │  ← 실제 Copilot CLI 호출
         │   Tests     │     (통합 환경)
         └──────┬──────┘
                │
       ┌────────┴────────┐
       │  Integration    │  ← Mock Copilot CLI
       │    Tests        │     (서버 통합)
       └────────┬────────┘
                │
    ┌───────────┴───────────┐
    │      Unit Tests       │  ← 각 모듈 개별 테스트
    │  (MessageTransformer, │
    │   TempDirManager, etc)│
    └───────────────────────┘
```

### 8.2 단위 테스트

```javascript
// tests/unit/messageTransformer.test.js
const { MessageTransformer } = require('../../src/services/messageTransformer');

describe('MessageTransformer', () => {
  let transformer;

  beforeEach(() => {
    transformer = new MessageTransformer();
  });

  describe('transform', () => {
    it('should extract system prompt', () => {
      const messages = [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hi' }
      ];

      const result = transformer.transform(messages);

      expect(result.systemPrompt).toBe('Be helpful');
      expect(result.prompt).toBe('Hi');
    });

    it('should handle multiple system messages', () => {
      const messages = [
        { role: 'system', content: 'Rule 1' },
        { role: 'system', content: 'Rule 2' },
        { role: 'user', content: 'Hi' }
      ];

      const result = transformer.transform(messages);

      expect(result.systemPrompt).toBe('Rule 1\n\nRule 2');
    });

    it('should format conversation history', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' }
      ];

      const result = transformer.transform(messages);

      expect(result.prompt).toContain('Previous conversation:');
      expect(result.prompt).toContain('User: Hello');
      expect(result.prompt).toContain('Assistant: Hi!');
      expect(result.prompt).toContain('How are you?');
    });
  });
});
```

### 8.3 통합 테스트

```javascript
// tests/integration/chatCompletions.test.js
const request = require('supertest');
const app = require('../../src/server');

// Mock copilot CLI
jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    const EventEmitter = require('events');
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();

    setTimeout(() => {
      proc.stdout.emit('data', Buffer.from('Hello from mock!'));
      proc.emit('close', 0);
    }, 10);

    return proc;
  })
}));

describe('POST /v1/chat/completions', () => {
  it('should return valid response', async () => {
    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'claude-opus-4.5',
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('choices');
    expect(response.body.choices[0].message.content).toBe('Hello from mock!');
  });

  it('should validate model', async () => {
    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'invalid-model',
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('model_not_found');
  });

  it('should require messages', async () => {
    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'claude-opus-4.5'
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
  });
});
```

### 8.4 E2E 테스트

```javascript
// tests/e2e/realCopilot.test.js
// 주의: 실제 Copilot CLI 필요, CI에서는 skip

describe('E2E: Real Copilot CLI', () => {
  const skipIfNoCopilot = process.env.SKIP_E2E === 'true';

  beforeAll(async () => {
    if (skipIfNoCopilot) return;
    // 서버 시작
  });

  it.skipIf(skipIfNoCopilot)('should get real response', async () => {
    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'claude-haiku-4.5',
        messages: [{ role: 'user', content: 'Reply with just "test"' }]
      });

    expect(response.status).toBe(200);
    expect(response.body.choices[0].message.content).toContain('test');
  });
});
```

### 8.5 테스트 커버리지 목표

| 영역 | 목표 | 필수 테스트 |
|------|------|------------|
| MessageTransformer | 100% | 모든 변환 케이스 |
| TempDirManager | 90% | 생성/정리 |
| Request Validation | 100% | 모든 에러 케이스 |
| Response Formatting | 95% | 스트리밍/비스트리밍 |
| Auth Middleware | 100% | 모든 인증 케이스 |

---

## 9. 프로젝트 구조

```
copilot-server/
├── docs/
│   ├── DESIGN.md              # 본 문서
│   └── EVALUATION.md          # 평가 문서
├── src/
│   ├── index.js               # 엔트리포인트
│   ├── server.js              # Express 앱 설정
│   ├── config.js              # 설정 로드
│   ├── routes/
│   │   ├── index.js           # 라우터 통합
│   │   ├── chat.js            # POST /v1/chat/completions
│   │   ├── models.js          # GET /v1/models
│   │   └── health.js          # GET /health
│   ├── services/
│   │   ├── copilotExecutor.js # CLI 실행 관리
│   │   ├── messageTransformer.js  # 메시지 변환
│   │   ├── tempDirManager.js  # 임시 디렉토리 관리
│   │   └── responseFormatter.js   # 응답 포맷팅
│   ├── middleware/
│   │   ├── auth.js            # 인증
│   │   ├── rateLimit.js       # 속도 제한
│   │   ├── validateRequest.js # 요청 검증
│   │   └── errorHandler.js    # 에러 처리
│   └── utils/
│       └── logger.js          # 로깅 유틸리티
├── tests/
│   ├── unit/
│   │   ├── messageTransformer.test.js
│   │   ├── tempDirManager.test.js
│   │   └── responseFormatter.test.js
│   ├── integration/
│   │   ├── chatCompletions.test.js
│   │   └── models.test.js
│   └── e2e/
│       └── realCopilot.test.js
├── .env.example               # 환경 변수 템플릿
├── .gitignore
├── package.json
└── README.md                  # 사용 가이드
```

---

## 10. 의존성

### 10.1 프로덕션 의존성

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "joi": "^17.11.0",
    "express-rate-limit": "^7.1.5",
    "uuid": "^9.0.0",
    "winston": "^3.11.0"
  }
}
```

### 10.2 개발 의존성

```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "nodemon": "^3.0.2",
    "eslint": "^8.55.0"
  }
}
```

---

## 11. 구현 체크리스트

### Phase 1: 기본 기능

- [ ] 프로젝트 초기화 (package.json, .env.example)
- [ ] 설정 모듈 (config.js)
- [ ] Express 서버 기본 설정
- [ ] 미들웨어 스택 (CORS, JSON parser)
- [ ] GET /health 엔드포인트
- [ ] GET /v1/models 엔드포인트
- [ ] MessageTransformer 구현
- [ ] TempDirManager 구현
- [ ] CopilotExecutor 구현 (비스트리밍)
- [ ] POST /v1/chat/completions (비스트리밍)
- [ ] 기본 에러 핸들러

### Phase 2: 스트리밍

- [ ] SSE 응답 포맷터
- [ ] 스트리밍 모드 CopilotExecutor
- [ ] POST /v1/chat/completions (스트리밍)

### Phase 3: 안정화

- [ ] 인증 미들웨어
- [ ] Rate Limiting
- [ ] 요청 검증 (Joi)
- [ ] 상세 에러 처리
- [ ] 로깅 시스템

### Phase 4: 테스트

- [ ] 단위 테스트
- [ ] 통합 테스트
- [ ] E2E 테스트 (선택)

---

## 12. 로깅 시스템

### 12.1 로그 파일 구조

```
logs/
├── combined.log      # 모든 로그
├── error.log         # 에러 로그만
└── requests/         # 요청별 상세 로그
    └── 2024-12-29/
        └── {request-id}.json
```

### 12.2 요청 로그 형식

```json
{
  "requestId": "req-abc123",
  "timestamp": "2024-12-29T12:00:00.000Z",
  "request": {
    "method": "POST",
    "path": "/v1/chat/completions",
    "model": "gpt-5-mini",
    "messages": [...],
    "stream": false
  },
  "tempDir": "/tmp/copilot-uuid-xxx",
  "response": {
    "status": 200,
    "duration": 1234,
    "content": "..."
  }
}
```

### 12.3 환경 변수

```env
# 로그 디렉토리 (기본: ./logs)
LOG_DIR=./logs

# 요청 로그 활성화 (기본: true)
LOG_REQUESTS=true

# 요청 본문 로깅 (기본: false, 민감정보 주의)
LOG_REQUEST_BODY=false

# 응답 본문 로깅 (기본: false)
LOG_RESPONSE_BODY=false
```

---

## 13. 데몬 실행

### 13.1 PM2 사용

```bash
# 시작
./start.sh

# 종료
./stop.sh

# 상태 확인
pm2 status copilot-server

# 로그 보기
pm2 logs copilot-server
```

### 13.2 start.sh

```bash
#!/bin/bash
pm2 start src/index.js --name copilot-server
pm2 save
```

### 13.3 stop.sh

```bash
#!/bin/bash
pm2 stop copilot-server
pm2 delete copilot-server
```

---

## 14. Chat Client

### 14.1 디렉토리 구조

```
chat-client/
├── chat.sh           # 대화형 클라이언트
└── README.md         # 사용 가이드
```

### 14.2 사용법

```bash
# 기본 실행
./chat-client/chat.sh

# 모델 지정
./chat-client/chat.sh --model claude-opus-4.5

# 시스템 프롬프트 지정
./chat-client/chat.sh --system "You are a helpful assistant"
```

---

## 15. 통합 테스트

### 15.1 테스트 구조

```
tests/
├── unit/                    # 단위 테스트
├── integration/             # 통합 테스트 (Mock)
└── e2e/                     # E2E 테스트 (실제 서버)
    ├── chat.e2e.test.js
    └── setup.js
```

### 15.2 실행 방법

```bash
# 단위 테스트
npm test

# E2E 테스트 (서버 실행 필요)
npm run test:e2e

# 전체 테스트
npm run test:all
```

---

## 16. 향후 확장 가능성

### 16.1 새 모델 지원

모델 목록은 Copilot CLI에서 **동적으로 탐색**되므로, Copilot CLI가 새 모델을 지원하면 자동으로 반영됩니다. 서버 재시작만 하면 됩니다.

폴백 모델 목록을 수정하려면 `src/services/modelDiscovery.js`의 `FALLBACK_MODELS` 배열을 편집합니다.

### 16.2 커스텀 미들웨어 추가

`src/middleware/` 디렉토리에 미들웨어 파일 생성 후 `server.js`에서 등록

### 16.3 추가 엔드포인트

`src/routes/` 디렉토리에 라우터 파일 생성 후 `routes/index.js`에서 등록

---

**문서 끝**
