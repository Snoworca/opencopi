# Copilot OpenAI Proxy

GitHub Copilot CLI 또는 Claude CLI를 OpenAI API 호환 서버로 래핑하여, OpenAI API를 지원하는 모든 클라이언트에서 사용할 수 있게 합니다.

## 테스트 환경

| 항목 | 버전 |
|------|------|
| **Copilot CLI** | 0.0.372 (Commit: 5534560) |
| **Claude CLI** | 1.0.3 (Build: 53143a4) |
| **Node.js** | v20.19.6 (테스트됨) |
| **Node.js 최소 버전** | v18.0.0 이상 |

## 주요 기능

- OpenAI Chat Completions API 완전 호환 (`/v1/chat/completions`)
- **듀얼 백엔드 지원**: GitHub Copilot CLI 또는 Claude CLI 선택
- 스트리밍 및 비스트리밍 응답 지원
- 동적 모델 탐색 (`/v1/models`)
- 시스템 프롬프트 지원
- API 키 인증 (선택)
- Rate Limiting
- 상세 요청/응답 로깅
- PM2 데몬 모드 지원
- 대화형 Chat Client 포함

## 요구사항

- **Node.js** >= 18.0.0
- **GitHub Copilot CLI** (`copilot` 명령어) - Copilot 모드 사용 시
- **Claude CLI** (`claude` 명령어) - Claude 모드 사용 시
- **GitHub Copilot 구독** (Individual $10/월, Business, 또는 Enterprise) - Copilot 모드
- **Anthropic API 키 또는 Claude Pro/Max 구독** - Claude 모드

## 설치

```bash
git clone https://github.com/Snoworca/copilot-stream.git
cd copilot-stream
npm install
```

## 설정

`.env` 파일을 생성하여 설정을 커스터마이즈할 수 있습니다:

```bash
# 서버 설정
PORT=3456                      # 서버 포트
HOST=0.0.0.0                   # 바인딩 주소

# 백엔드 서비스 선택
SERVICE=copilot                # 'copilot' 또는 'claude'

# Copilot 설정 (SERVICE=copilot)
DEFAULT_MODEL=gpt-4.1          # 기본 모델
COPILOT_CLI_PATH=copilot       # Copilot CLI 경로

# Claude 설정 (SERVICE=claude)
CLAUDE_CLI_PATH=claude         # Claude CLI 경로

# 공통 설정
REQUEST_TIMEOUT=300000         # 요청 타임아웃 (ms)
TEMP_DIR_BASE=/tmp             # 임시 디렉토리 기본 경로

# 보안 설정
API_KEY=your-secret-api-key    # API 키 (비어있으면 인증 비활성화)
CORS_ORIGINS=*                 # CORS 허용 도메인

# Rate Limiting
RATE_LIMIT_MAX=100             # 윈도우당 최대 요청 수
RATE_LIMIT_WINDOW=60000        # 윈도우 크기 (ms)

# 로깅 설정
LOG_LEVEL=info                 # 로그 레벨 (debug, info, warn, error)
LOG_DIR=./logs                 # 로그 디렉토리
LOG_REQUESTS=true              # 요청 로그 활성화
LOG_REQUEST_BODY=false         # 요청 본문 로깅
LOG_RESPONSE_BODY=false        # 응답 본문 로깅
```

## 백엔드 모드

### Copilot 모드 (기본)

```bash
SERVICE=copilot ./start.sh
```

- 동적 모델 탐색 (13+ 모델 지원)
- OpenAI, Anthropic, Google 등 다양한 모델
- 시스템 프롬프트: AGENTS.md 파일 생성 방식

### Claude 모드

```bash
SERVICE=claude ./start.sh
```

- 단일 모델만 지원: `claude-haiku-4-5-20251001`
- 시스템 프롬프트: 임시 파일 방식 (`--system-prompt-file`)
- Claude CLI가 `--dangerously-skip-permissions` 옵션으로 실행됨

### Claude 모드 제한사항

| 항목 | Copilot 모드 | Claude 모드 |
|------|-------------|-------------|
| 모델 선택 | 동적 (13+ 모델) | 고정 (1개) |
| 모델 변경 | 요청별 가능 | 불가능 |
| 시스템 프롬프트 | AGENTS.md | 임시 파일 |
| CLI 옵션 | - | `--dangerously-skip-permissions` |

> **참고**: Claude 모드에서는 요청의 `model` 파라미터가 무시되고 항상 `claude-haiku-4-5-20251001` 모델이 사용됩니다.

## 실행

### 기본 실행

```bash
npm start
```

### 개발 모드 (자동 재시작)

```bash
npm run dev
```

### PM2 데몬 모드

```bash
# PM2 설치 (최초 1회)
npm install -g pm2

# 시작
pm2 start ecosystem.config.js

# 또는 스크립트 사용
./start.sh

# 상태 확인
pm2 status copilot-server

# 로그 확인
pm2 logs copilot-server

# 중지
pm2 stop copilot-server
# 또는
./stop.sh

# 재시작
pm2 restart copilot-server
```

---

## API 문서

### 기본 정보

| 항목 | 값 |
|------|-----|
| Base URL | `http://localhost:3456` |
| Content-Type | `application/json` |
| 인증 | `Authorization: Bearer <API_KEY>` (설정된 경우) |

---

### GET /v1/models

사용 가능한 모델 목록을 반환합니다. Copilot CLI에서 동적으로 탐색됩니다.

#### 요청

```bash
curl http://localhost:3456/v1/models
```

#### 응답

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4.1",
      "object": "model",
      "created": 1735470000,
      "owned_by": "openai"
    },
    {
      "id": "claude-sonnet-4.5",
      "object": "model",
      "created": 1735470000,
      "owned_by": "anthropic"
    },
    {
      "id": "gemini-3-pro-preview",
      "object": "model",
      "created": 1735470000,
      "owned_by": "google"
    }
  ]
}
```

#### 권장 모델

| 모델 ID | 설명 |
|---------|------|
| `gpt-4.1` | **권장** - 범용적 사용 가능, 빠른 응답 속도 |
| `gpt-5-mini` | 범용적 사용 가능하나 응답 속도가 느림 |

> 모델 목록은 Copilot CLI에서 동적으로 탐색되므로, 사용 가능한 전체 모델은 `/v1/models` API로 확인하세요.

---

### GET /v1/models/:model

특정 모델의 정보를 반환합니다.

#### 요청

```bash
curl http://localhost:3456/v1/models/gpt-4.1
```

#### 응답 (200 OK)

```json
{
  "id": "gpt-4.1",
  "object": "model",
  "created": 1735470000,
  "owned_by": "openai"
}
```

#### 에러 응답 (404 Not Found)

```json
{
  "error": {
    "message": "Model 'invalid-model' not found",
    "type": "not_found",
    "code": "model_not_found"
  }
}
```

---

### POST /v1/chat/completions

채팅 완성 요청을 처리합니다. OpenAI API와 완전히 호환됩니다.

#### 요청 파라미터

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `model` | string | Yes | - | 사용할 모델 ID |
| `messages` | array | Yes | - | 메시지 배열 |
| `stream` | boolean | No | `false` | 스트리밍 여부 |

#### 메시지 형식

| 필드 | 타입 | 설명 |
|------|------|------|
| `role` | string | `system`, `user`, `assistant` 중 하나 |
| `content` | string | 메시지 내용 |

```json
{
  "role": "user",
  "content": "Hello, how are you?"
}
```

#### 비스트리밍 요청

```bash
curl http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

#### 비스트리밍 응답 (200 OK)

```json
{
  "id": "chatcmpl-copilot-abc123def456",
  "object": "chat.completion",
  "created": 1735470000,
  "model": "gpt-4.1",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
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

> **참고**: `usage` 필드의 토큰 수는 Copilot CLI에서 제공하지 않으므로 `-1`로 표시됩니다.

#### 스트리밍 요청

```bash
curl -N http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'
```

#### 스트리밍 응답 (SSE)

```
data: {"id":"chatcmpl-copilot-abc123def456","object":"chat.completion.chunk","created":1735470000,"model":"gpt-4.1","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-copilot-abc123def456","object":"chat.completion.chunk","created":1735470000,"model":"gpt-4.1","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-copilot-abc123def456","object":"chat.completion.chunk","created":1735470000,"model":"gpt-4.1","choices":[{"index":0,"delta":{"content":" How can I help you?"},"finish_reason":null}]}

data: {"id":"chatcmpl-copilot-abc123def456","object":"chat.completion.chunk","created":1735470000,"model":"gpt-4.1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

#### 스트리밍 청크 구조

| 필드 | 설명 |
|------|------|
| `id` | 응답 고유 ID |
| `object` | 항상 `chat.completion.chunk` |
| `created` | Unix timestamp |
| `model` | 사용된 모델 |
| `choices[0].delta.role` | 첫 청크에만 포함 (`assistant`) |
| `choices[0].delta.content` | 텍스트 내용 (마지막 청크에서는 빈 객체) |
| `choices[0].finish_reason` | 마지막 청크에서만 `stop`, 그 외 `null` |

---

### GET /health

서버 상태를 확인합니다.

#### 요청

```bash
curl http://localhost:3456/health
```

#### 응답

```json
{
  "status": "ok",
  "timestamp": "2024-12-29T12:00:00.000Z"
}
```

---

## 에러 응답

모든 에러는 다음 형식으로 반환됩니다:

```json
{
  "error": {
    "message": "에러 메시지",
    "type": "에러 타입",
    "code": "에러 코드"
  }
}
```

### 에러 코드 목록

| HTTP 상태 | 타입 | 코드 | 설명 |
|-----------|------|------|------|
| 400 | `invalid_request_error` | `missing_messages` | messages 필드 누락 |
| 400 | `invalid_request_error` | `invalid_model` | 잘못된 모델 ID |
| 401 | `authentication_error` | `invalid_api_key` | API 키 인증 실패 |
| 404 | `not_found` | `model_not_found` | 모델을 찾을 수 없음 |
| 429 | `rate_limit_error` | `rate_limit_exceeded` | Rate limit 초과 |
| 503 | `service_unavailable` | `copilot_execution_error` | Copilot CLI 실행 실패 |
| 503 | `service_unavailable` | `copilot_spawn_error` | Copilot CLI 프로세스 생성 실패 |
| 503 | `service_unavailable` | `claude_execution_error` | Claude CLI 실행 실패 |
| 503 | `service_unavailable` | `claude_spawn_error` | Claude CLI 프로세스 생성 실패 |
| 504 | `timeout_error` | `timeout` | 요청 시간 초과 |

---

## 사용 예제

### Python (OpenAI 라이브러리)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3456/v1",
    api_key="your-api-key"  # API_KEY 미설정 시 아무 값이나 입력
)

response = client.chat.completions.create(
    model="gpt-4.1",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)
```

### Python (스트리밍)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3456/v1",
    api_key="your-api-key"
)

stream = client.chat.completions.create(
    model="claude-sonnet-4.5",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()
```

### Node.js

```javascript
const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'http://localhost:3456/v1',
  apiKey: 'your-api-key'
});

async function main() {
  const response = await client.chat.completions.create({
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: 'Hello!' }]
  });

  console.log(response.choices[0].message.content);
}

main();
```

### Node.js (스트리밍)

```javascript
const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'http://localhost:3456/v1',
  apiKey: 'your-api-key'
});

async function main() {
  const stream = await client.chat.completions.create({
    model: 'claude-sonnet-4.5',
    messages: [{ role: 'user', content: 'Tell me a story' }],
    stream: true
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  console.log();
}

main();
```

### cURL

```bash
# 비스트리밍
curl http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# 스트리밍
curl -N http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

---

## Chat Client

대화형 CLI 클라이언트가 포함되어 있습니다.

### 사용법

```bash
cd chat-client
./chat.sh
```

### 옵션

```bash
./chat.sh --model claude-sonnet-4.5  # 모델 지정
./chat.sh --system "You are a pirate" # 시스템 프롬프트
./chat.sh --server http://localhost:3456  # 서버 URL
./chat.sh --api-key your-key  # API 키
./chat.sh --no-stream  # 스트리밍 비활성화
```

### 환경 변수

```bash
export COPILOT_SERVER_URL=http://localhost:3456
export COPILOT_MODEL=gpt-4.1
export COPILOT_API_KEY=your-api-key

./chat.sh
```

### 대화 중 명령어

| 명령어 | 설명 |
|--------|------|
| `/model MODEL` | 모델 변경 |
| `/models` | 사용 가능한 모델 목록 조회 |
| `/system PROMPT` | 시스템 프롬프트 변경 (대화 초기화) |
| `/clear` | 대화 내역 초기화 |
| `/history` | 대화 내역 출력 |
| `/help` | 도움말 |
| `/quit`, `/exit` | 종료 |

자세한 내용은 [chat-client/README.md](chat-client/README.md)를 참조하세요.

---

## 로깅

로그 파일은 `./logs/` 디렉토리에 저장됩니다:

```
logs/
├── combined.log      # 모든 로그
├── error.log         # 에러 로그만
└── requests/         # 요청별 상세 로그
    └── 2024-12-29/
        └── req-abc123.json
```

요청 로그에는 다음 정보가 포함됩니다:
- 요청 ID, 타임스탬프
- HTTP 메서드, 경로, IP
- 모델, 메시지 수, 스트리밍 여부
- 사용된 임시 디렉토리 (tempDir)
- 응답 상태 코드, 소요 시간

---

## 테스트

```bash
# 단위 테스트
npm test

# 테스트 감시 모드
npm run test:watch

# E2E 테스트 (서버 실행 필요)
npm run test:e2e

# 전체 테스트
npm run test:all

# 커버리지
npm run test:coverage
```

---

## 프로젝트 구조

```
copilot-server/
├── src/
│   ├── index.js                  # 진입점
│   ├── server.js                 # Express 서버
│   ├── config.js                 # 설정
│   ├── routes/
│   │   ├── index.js              # 라우터 통합
│   │   ├── chat.js               # POST /v1/chat/completions
│   │   ├── models.js             # GET /v1/models
│   │   └── health.js             # GET /health
│   ├── services/
│   │   ├── copilotExecutor.js    # Copilot CLI 실행
│   │   ├── claudeExecutor.js     # Claude CLI 실행
│   │   ├── modelDiscovery.js     # 모델 동적 탐색
│   │   ├── messageTransformer.js # 메시지 변환
│   │   ├── responseFormatter.js  # OpenAI 응답 포맷팅
│   │   └── tempDirManager.js     # 임시 디렉토리 관리
│   ├── middleware/
│   │   ├── auth.js               # API 키 인증
│   │   ├── rateLimit.js          # Rate limiting
│   │   ├── validateRequest.js    # 요청 검증
│   │   ├── requestLogger.js      # 요청 로깅
│   │   └── errorHandler.js       # 에러 처리
│   └── utils/
│       └── logger.js             # Winston 로거
├── chat-client/
│   ├── chat.sh                   # 대화형 CLI 클라이언트
│   └── README.md
├── tests/
│   ├── unit/                     # 단위 테스트
│   ├── integration/              # 통합 테스트
│   └── e2e/                      # E2E 테스트
├── logs/                         # 로그 디렉토리
├── ecosystem.config.js           # PM2 설정
├── start.sh                      # 데몬 시작 스크립트
├── stop.sh                       # 데몬 종료 스크립트
├── package.json
├── .env.example
├── .eslintrc.js                  # ESLint 설정
└── README.md
```

---

## 트러블슈팅

### Copilot 인증 오류

Copilot CLI 사용 시 인증 문제가 계속 발생하면 GitHub CLI를 설치하세요:

```bash
# Ubuntu/Debian
sudo apt install gh

# macOS
brew install gh

# 로그인
gh auth login
```

GitHub CLI 로그인 후 Copilot CLI 인증이 자동으로 해결됩니다.

---

## 라이선스

MIT License
