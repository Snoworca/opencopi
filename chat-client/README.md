# Copilot Server Chat Client

대화형 CLI 클라이언트로 Copilot Server를 테스트할 수 있습니다.

## 요구사항

- bash
- curl
- jq (선택, 응답 파싱용)

## 사용법

### 기본 실행

```bash
./chat.sh
```

### 옵션

```bash
# 모델 지정
./chat.sh --model claude-opus-4.5

# 시스템 프롬프트 지정
./chat.sh --system "You are a helpful assistant"

# 서버 URL 지정
./chat.sh --server http://localhost:3456

# API 키 사용
./chat.sh --api-key your-api-key

# 스트리밍 비활성화
./chat.sh --no-stream

# 모든 옵션 조합
./chat.sh --model gpt-5 --system "You are a pirate" --no-stream
```

### 환경 변수

```bash
export COPILOT_SERVER_URL=http://localhost:3456
export COPILOT_MODEL=gpt-4.1
export COPILOT_API_KEY=your-api-key

./chat.sh
```

## 대화 중 명령어

| 명령어 | 설명 |
|--------|------|
| `/model MODEL` | 모델 변경 |
| `/models` | 사용 가능한 모델 목록 조회 |
| `/system PROMPT` | 시스템 프롬프트 변경 (대화 초기화) |
| `/clear` | 대화 내역 초기화 |
| `/history` | 대화 내역 출력 |
| `/help` | 도움말 출력 |
| `/quit`, `/exit` | 종료 |

## 예시

```
$ ./chat.sh --model claude-haiku-4.5

==================================
  Copilot Server Chat Client
==================================
서버: http://localhost:3456
모델: claude-haiku-4.5
스트리밍: true
----------------------------------
'/help'를 입력하면 도움말을 볼 수 있습니다.

You: Hello!
Assistant: Hello! How can I help you today?

You: /model gpt-5
모델이 'gpt-5'로 변경되었습니다.

You: What is 2+2?
Assistant: 2 + 2 = 4

You: /quit
Goodbye!
```
