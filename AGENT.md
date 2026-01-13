# AGENT.md

## 프로젝트 개요

**Copilot OpenAI Proxy**는 GitHub Copilot CLI 또는 Claude CLI를 OpenAI API 호환 서버로 래핑하여, OpenAI API를 지원하는 모든 클라이언트에서 사용할 수 있게 하는 프록시 서버입니다.

- **프로젝트명**: copilot-server
- **버전**: 1.0.0
- **라이선스**: MIT
- **Node.js 요구사항**: >= 18.0.0
- **총 코드 라인 수**: ~2,000 LOC

## 핵심 기능

### 1. 듀얼 백엔드 지원
- **Copilot 모드**: GitHub Copilot CLI 사용 (13+ 모델 동적 탐색)
- **Claude 모드**: Claude CLI 사용 (단일 모델: claude-haiku-4-5-20251001)
- 환경 변수 `SERVICE`로 백엔드 선택 가능

### 2. OpenAI API 완전 호환
- `POST /v1/chat/completions` - Chat Completions API
- `GET /v1/models` - 모델 목록 조회
- `GET /v1/models/:model` - 특정 모델 정보 조회
- `GET /health` - 헬스체크
- 스트리밍 및 비스트리밍 응답 지원
- OpenAI SDK 직접 사용 가능

### 3. 보안 및 운영
- API 키 인증 (선택 사항)
- Rate Limiting (기본: 60초당 100회)
- CORS 설정 가능
- 상세 요청/응답 로깅
- PM2 데몬 모드 지원
- 타임아웃 관리

### 4. 고급 기능
- 시스템 프롬프트 지원 (AGENTS.md 파일 또는 임시 파일)
- 동적 모델 탐색 (Copilot 모드)
- 임시 디렉토리 자동 관리
- 대화형 Chat Client 포함

## 아키텍처

### 디렉토리 구조

```
opencopi/
├── src/
│   ├── index.js                  # 진입점
│   ├── server.js                 # Express 서버 설정
│   ├── config.js                 # 중앙 설정 관리
│   ├── middleware/               # Express 미들웨어
│   │   ├── auth.js               # API 키 인증
│   │   ├── rateLimit.js          # Rate limiting
│   │   ├── validateRequest.js    # 요청 검증
│   │   ├── requestLogger.js      # 요청 로깅
│   │   └── errorHandler.js       # 에러 처리
│   ├── routes/                   # API 라우트
│   │   ├── index.js              # 라우터 통합
│   │   ├── chat.js               # Chat Completions
│   │   ├── models.js             # 모델 목록
│   │   ├── health.js             # 헬스체크
│   │   └── responses.js          # 응답 유틸리티
│   ├── services/                 # 비즈니스 로직
│   │   ├── copilotExecutor.js    # Copilot CLI 실행
│   │   ├── claudeExecutor.js     # Claude CLI 실행
│   │   ├── modelDiscovery.js     # 모델 동적 탐색
│   │   ├── messageTransformer.js # 메시지 변환
│   │   ├── responseFormatter.js  # OpenAI 응답 포맷팅
│   │   └── tempDirManager.js     # 임시 디렉토리 관리
│   └── utils/
│       └── logger.js             # Winston 로거
├── chat-client/
│   ├── chat.sh                   # 대화형 CLI 클라이언트
│   └── README.md
├── tests/
│   ├── unit/                     # 단위 테스트
│   ├── integration/              # 통합 테스트
│   └── e2e/                      # E2E 테스트
├── docs/                         # 문서
├── logs/                         # 로그 파일
├── ecosystem.config.js           # PM2 설정
├── start.sh                      # 데몬 시작
├── stop.sh                       # 데몬 종료
├── package.json
└── README.md
```

### 핵심 컴포넌트

#### 1. Server Layer (server.js)
- Express 애플리케이션 설정
- 미들웨어 체인 구성
- CORS, JSON 파싱, 인증, Rate Limiting

#### 2. Routes Layer
- **chat.js**: Chat Completions API 엔드포인트
- **models.js**: 모델 목록 및 정보 조회
- **health.js**: 서버 상태 확인

#### 3. Service Layer
- **copilotExecutor.js**: Copilot CLI 프로세스 관리 및 실행
- **claudeExecutor.js**: Claude CLI 프로세스 관리 및 실행
- **modelDiscovery.js**: CLI로부터 모델 목록 동적 탐색 및 캐싱
- **messageTransformer.js**: OpenAI 메시지를 CLI 프롬프트로 변환
- **responseFormatter.js**: CLI 출력을 OpenAI 응답 형식으로 변환
- **tempDirManager.js**: 임시 디렉토리 생성/정리 및 AGENTS.md 파일 관리

#### 4. Middleware Layer
- **auth.js**: Bearer 토큰 검증
- **rateLimit.js**: express-rate-limit 기반 속도 제한
- **validateRequest.js**: Joi 스키마 기반 요청 검증
- **requestLogger.js**: 요청/응답 상세 로깅
- **errorHandler.js**: 통합 에러 핸들링

## 데이터 플로우

### 비스트리밍 요청
```
1. Client → POST /v1/chat/completions
2. validateRequest → 요청 검증
3. messageTransformer → OpenAI messages → CLI prompt
4. tempDirManager → 임시 디렉토리 생성 + AGENTS.md 작성
5. copilotExecutor/claudeExecutor → CLI 실행
6. responseFormatter → CLI 출력 → OpenAI response
7. tempDirManager → 임시 디렉토리 정리
8. Client ← JSON 응답
```

### 스트리밍 요청
```
1. Client → POST /v1/chat/completions (stream: true)
2. validateRequest → 요청 검증
3. messageTransformer → OpenAI messages → CLI prompt
4. tempDirManager → 임시 디렉토리 생성 + AGENTS.md 작성
5. copilotExecutor/claudeExecutor → CLI 프로세스 spawn
6. CLI stdout → 실시간으로 SSE 청크 전송
7. responseFormatter → 각 청크를 OpenAI 형식으로 변환
8. Client ← Server-Sent Events (SSE) 스트림
9. 프로세스 종료 → tempDirManager → 정리
```

### 모델 탐색 (Copilot 모드)
```
1. Server 시작 → modelDiscovery.preloadModels()
2. copilot --model invalid-model-for-discovery 실행
3. stderr에서 "Allowed choices are X, Y, Z." 파싱
4. 모델 목록 캐싱 → inferOwner()로 제공사 추론
5. GET /v1/models 요청 시 캐시된 목록 반환
```

## 주요 기술 스택

### 백엔드
- **Node.js** (>= 18.0.0)
- **Express.js** - 웹 프레임워크
- **Winston** - 로깅
- **Joi** - 스키마 검증
- **express-rate-limit** - Rate limiting
- **CORS** - CORS 지원
- **dotenv** - 환경 변수 관리
- **uuid** - 고유 ID 생성

### CLI 통합
- **child_process.spawn** - CLI 프로세스 관리
- **GitHub Copilot CLI** (copilot)
- **Claude CLI** (claude)

### 개발/배포
- **PM2** - 프로세스 관리 및 데몬화
- **Jest** - 테스트 프레임워크
- **SuperTest** - API 테스트
- **ESLint** - 코드 품질
- **Nodemon** - 개발 모드 자동 재시작

## 설정 및 환경 변수

### 필수 설정
```bash
SERVICE=copilot              # 'copilot' 또는 'claude'
PORT=3456                    # 서버 포트
HOST=0.0.0.0                 # 바인딩 주소
```

### Copilot 설정
```bash
DEFAULT_MODEL=gpt-4.1        # 기본 모델
COPILOT_CLI_PATH=copilot     # Copilot CLI 경로
```

### Claude 설정
```bash
CLAUDE_CLI_PATH=claude       # Claude CLI 경로
```

### 보안 설정
```bash
API_KEY=your-secret-key      # API 키 (선택 사항)
CORS_ORIGINS=*               # CORS 허용 도메인
RATE_LIMIT_MAX=100           # Rate limit (60초당)
RATE_LIMIT_WINDOW=60000      # 윈도우 크기 (ms)
```

### 로깅 설정
```bash
LOG_LEVEL=info               # debug, info, warn, error
LOG_DIR=./logs               # 로그 디렉토리
LOG_REQUESTS=true            # 요청 로깅 활성화
LOG_REQUEST_BODY=false       # 요청 본문 로깅
LOG_RESPONSE_BODY=false      # 응답 본문 로깅
```

### 기타 설정
```bash
REQUEST_TIMEOUT=300000       # 요청 타임아웃 (5분)
TEMP_DIR_BASE=/tmp           # 임시 디렉토리 기본 경로
```

## 사용 예제

### Python (OpenAI SDK)
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3456/v1",
    api_key="your-api-key"
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

### Node.js (OpenAI SDK)
```javascript
const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'http://localhost:3456/v1',
  apiKey: 'your-api-key'
});

const response = await client.chat.completions.create({
  model: 'gpt-4.1',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.choices[0].message.content);
```

### cURL
```bash
curl http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 운영 및 모니터링

### 실행 방식
```bash
# 개발 모드 (자동 재시작)
npm run dev

# 프로덕션 모드
npm start

# PM2 데몬 모드
./start.sh
pm2 status copilot-server
pm2 logs copilot-server
./stop.sh
```

### 로그 구조
```
logs/
├── combined.log              # 모든 로그
├── error.log                 # 에러만
└── requests/                 # 요청별 상세 로그
    └── 2024-12-29/
        └── req-abc123.json   # 요청 ID별 로그
```

### 로그 내용
- 요청 ID, 타임스탬프
- HTTP 메서드, 경로, IP 주소
- 모델, 메시지 수, 스트리밍 여부
- 사용된 임시 디렉토리 (tempDir)
- 응답 상태 코드, 소요 시간
- 에러 발생 시 스택 트레이스

## 테스트

### 테스트 구조
```bash
tests/
├── unit/           # 단위 테스트 (개별 함수/클래스)
├── integration/    # 통합 테스트 (여러 모듈)
└── e2e/            # E2E 테스트 (전체 API)
```

### 테스트 실행
```bash
npm test                # 단위 + 통합 테스트
npm run test:watch      # 감시 모드
npm run test:e2e        # E2E 테스트 (서버 필요)
npm run test:all        # 전체 테스트
npm run test:coverage   # 커버리지
```

## 알려진 제약사항

### Copilot vs Claude 모드 차이

| 항목 | Copilot 모드 | Claude 모드 |
|------|-------------|-------------|
| 모델 선택 | 동적 (13+ 모델) | 고정 (1개) |
| 모델 변경 | 요청별 가능 | 불가능 |
| 시스템 프롬프트 | AGENTS.md | 임시 파일 |
| CLI 옵션 | - | --dangerously-skip-permissions |
| 동적 탐색 | 지원 | 미지원 |

### 일반적인 제약사항
- 토큰 사용량 (usage) 정보는 -1로 반환 (CLI에서 미제공)
- OpenAI 파라미터 무시: temperature, max_tokens, top_p, presence_penalty, frequency_penalty
- CLI 의존성: Copilot CLI 또는 Claude CLI 설치 필수
- 임시 디렉토리 사용: 각 요청마다 생성/삭제

## 문제 해결

### Copilot 인증 오류
```bash
# GitHub CLI 설치 및 로그인
sudo apt install gh    # Ubuntu/Debian
brew install gh        # macOS
gh auth login
```

### Claude 권한 오류
- `--dangerously-skip-permissions` 옵션 자동 적용됨
- 환경 변수 `CLAUDE_CLI_PATH`로 경로 명시 가능

### Rate Limit 초과
```bash
# .env 파일에서 조정
RATE_LIMIT_MAX=200
RATE_LIMIT_WINDOW=60000
```

### 타임아웃 발생
```bash
# .env 파일에서 조정
REQUEST_TIMEOUT=600000  # 10분
```

## 개발 가이드

### 새로운 백엔드 추가
1. `src/services/`에 `xxxExecutor.js` 생성
2. `execute()` 및 `executeStream()` 메서드 구현
3. `src/routes/chat.js`의 `getExecutor()` 함수 수정
4. `config.js`에 설정 추가

### 새로운 엔드포인트 추가
1. `src/routes/`에 라우터 파일 생성
2. `src/routes/index.js`에 라우터 등록
3. 필요한 미들웨어 적용
4. 테스트 작성 (`tests/e2e/`)

### 미들웨어 추가
1. `src/middleware/`에 미들웨어 생성
2. `server.js`에서 등록 (순서 중요)
3. 테스트 작성 (`tests/unit/middleware/`)

## AI Agent 사용 시 참고사항

이 프로젝트를 AI Agent가 개발/수정할 때 유의할 사항:

### 1. 코드 수정 시
- **최소 변경 원칙**: 필요한 최소한의 코드만 수정
- **기존 로직 보존**: 동작하는 코드는 가능한 유지
- **미들웨어 순서**: `server.js`의 미들웨어 순서는 중요 (인증 → Rate Limit → 라우트)
- **에러 처리**: 모든 비동기 작업에 try-catch 또는 .catch() 필수

### 2. 임시 디렉토리 관리
- `tempDirManager`는 반드시 finally 블록에서 cleanup 호출
- AGENTS.md 파일은 시스템 프롬프트가 있을 때만 생성
- 임시 디렉토리 경로는 항상 로그에 기록

### 3. 스트리밍 처리
- SSE 헤더 설정 후 변경 불가
- 클라이언트 연결 종료 시 프로세스 kill 필수
- 에러 발생 시 헤더 전송 여부 확인

### 4. 모델 탐색
- Copilot 모드: 동적 탐색 (캐싱)
- Claude 모드: 단일 모델만 반환
- 폴백 모델 목록 유지

### 5. 테스트 실행
- 변경 후 반드시 테스트 실행
- E2E 테스트는 서버 실행 필요
- 기존 테스트는 수정 금지 (새 기능은 새 테스트 추가)

### 6. 로깅
- 모든 중요 작업은 로그 기록
- 에러는 항상 logger.error() 사용
- 민감 정보는 로그에 포함 금지

### 7. 의존성
- 새로운 패키지 추가 시 반드시 package.json 업데이트
- devDependencies vs dependencies 구분
- 최소 Node.js 버전 (18.0.0) 호환성 확인

## 참고 문서

- [README.md](README.md) - 사용자 가이드 및 API 문서
- [chat-client/README.md](chat-client/README.md) - Chat Client 사용법
- [docs/DESIGN.md](docs/DESIGN.md) - 상세 설계 문서
- [docs/EVALUATION.md](docs/EVALUATION.md) - 평가 및 분석
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference) - OpenAI API 사양

## 기여 가이드

1. Fork 및 브랜치 생성
2. 변경 사항 구현 및 테스트
3. ESLint 규칙 준수 (`npm run lint`)
4. 커밋 메시지는 명확하게 작성
5. Pull Request 생성

## 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능
