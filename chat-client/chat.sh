#!/bin/bash

# Copilot Server Chat Client
# 대화형 CLI 클라이언트

# 기본 설정
SERVER_URL="${COPILOT_SERVER_URL:-http://localhost:3456}"
MODEL="${COPILOT_MODEL:-gpt-4.1}"
SYSTEM_PROMPT=""
API_KEY="${COPILOT_API_KEY:-}"
STREAM="true"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 사용법 출력
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --server URL      서버 URL (기본: http://localhost:3456)"
    echo "  --model MODEL     모델 ID (기본: gpt-5-mini)"
    echo "  --system PROMPT   시스템 프롬프트"
    echo "  --api-key KEY     API 키"
    echo "  --no-stream       스트리밍 비활성화"
    echo "  -h, --help        도움말 출력"
    echo ""
    echo "환경 변수:"
    echo "  COPILOT_SERVER_URL  서버 URL"
    echo "  COPILOT_MODEL       모델 ID"
    echo "  COPILOT_API_KEY     API 키"
    echo ""
    echo "명령어 (대화 중):"
    echo "  /model MODEL       모델 변경"
    echo "  /system PROMPT     시스템 프롬프트 변경"
    echo "  /clear             대화 내역 초기화"
    echo "  /history           대화 내역 출력"
    echo "  /help              도움말 출력"
    echo "  /quit, /exit       종료"
    exit 0
}

# 인자 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        --server)
            SERVER_URL="$2"
            shift 2
            ;;
        --model)
            MODEL="$2"
            shift 2
            ;;
        --system)
            SYSTEM_PROMPT="$2"
            shift 2
            ;;
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --no-stream)
            STREAM="false"
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "알 수 없는 옵션: $1"
            usage
            ;;
    esac
done

# curl 확인
if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl이 설치되어 있지 않습니다.${NC}"
    exit 1
fi

# jq 확인
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq가 설치되어 있지 않습니다. 응답 파싱이 제한됩니다.${NC}"
    HAS_JQ=false
else
    HAS_JQ=true
fi

# 대화 내역 초기화
MESSAGES='[]'

# 메시지 추가 함수
add_message() {
    local role="$1"
    local content="$2"
    MESSAGES=$(echo "$MESSAGES" | jq --arg role "$role" --arg content "$content" '. + [{"role": $role, "content": $content}]')
}

# 시스템 프롬프트 추가
if [ -n "$SYSTEM_PROMPT" ]; then
    add_message "system" "$SYSTEM_PROMPT"
fi

# 헤더 출력
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}  Copilot Server Chat Client${NC}"
echo -e "${GREEN}==================================${NC}"
echo -e "서버: ${BLUE}$SERVER_URL${NC}"
echo -e "모델: ${BLUE}$MODEL${NC}"
echo -e "스트리밍: ${BLUE}$STREAM${NC}"
if [ -n "$SYSTEM_PROMPT" ]; then
    echo -e "시스템: ${BLUE}$SYSTEM_PROMPT${NC}"
fi
echo -e "${GREEN}----------------------------------${NC}"
echo -e "'/help'를 입력하면 도움말을 볼 수 있습니다."
echo ""

# API 호출 함수
call_api() {
    local messages="$1"
    local auth_header=""

    if [ -n "$API_KEY" ]; then
        auth_header="-H \"Authorization: Bearer $API_KEY\""
    fi

    local body=$(jq -n \
        --arg model "$MODEL" \
        --argjson messages "$messages" \
        --argjson stream "$STREAM" \
        '{model: $model, messages: $messages, stream: $stream}')

    if [ "$STREAM" = "true" ]; then
        # 스트리밍 모드
        echo -e "${GREEN}Assistant:${NC} "

        curl -s -N "$SERVER_URL/v1/chat/completions" \
            -H "Content-Type: application/json" \
            ${API_KEY:+-H "Authorization: Bearer $API_KEY"} \
            -d "$body" 2>/dev/null | while IFS= read -r line; do
            if [[ "$line" == data:* ]]; then
                data="${line#data: }"
                if [ "$data" = "[DONE]" ]; then
                    echo ""
                elif [ -n "$data" ] && $HAS_JQ; then
                    content=$(echo "$data" | jq -r '.choices[0].delta.content // empty' 2>/dev/null)
                    if [ -n "$content" ]; then
                        printf "%s" "$content"
                    fi
                fi
            fi
        done
        echo ""
    else
        # 비스트리밍 모드
        response=$(curl -s "$SERVER_URL/v1/chat/completions" \
            -H "Content-Type: application/json" \
            ${API_KEY:+-H "Authorization: Bearer $API_KEY"} \
            -d "$body")

        if $HAS_JQ; then
            content=$(echo "$response" | jq -r '.choices[0].message.content // .error.message // "Error: Unknown response"')
            echo -e "${GREEN}Assistant:${NC} $content"
        else
            echo -e "${GREEN}Assistant:${NC} $response"
        fi

        echo ""
    fi
}

# 메인 루프
while true; do
    echo -ne "${BLUE}You:${NC} "
    read -r input

    # 빈 입력 무시
    [ -z "$input" ] && continue

    # 명령어 처리
    case "$input" in
        /quit|/exit)
            echo -e "${YELLOW}Goodbye!${NC}"
            exit 0
            ;;
        /help)
            echo -e "${YELLOW}명령어:${NC}"
            echo "  /model MODEL       모델 변경"
            echo "  /models            사용 가능한 모델 목록"
            echo "  /system PROMPT     시스템 프롬프트 변경"
            echo "  /clear             대화 내역 초기화"
            echo "  /history           대화 내역 출력"
            echo "  /quit, /exit       종료"
            echo ""
            continue
            ;;
        /models)
            echo -e "${YELLOW}사용 가능한 모델 목록:${NC}"
            if $HAS_JQ; then
                curl -s "$SERVER_URL/v1/models" | jq -r '.data[].id' 2>/dev/null || echo "서버에 연결할 수 없습니다."
            else
                curl -s "$SERVER_URL/v1/models" 2>/dev/null || echo "서버에 연결할 수 없습니다."
            fi
            echo -e "현재 모델: ${BLUE}$MODEL${NC}"
            echo ""
            continue
            ;;
        /model\ *)
            NEW_MODEL="${input#/model }"
            # 앞뒤 공백 제거
            NEW_MODEL=$(echo "$NEW_MODEL" | xargs)
            if [ -z "$NEW_MODEL" ]; then
                echo -e "${RED}사용법: /model MODEL_NAME${NC}"
                echo -e "현재 모델: ${BLUE}$MODEL${NC}"
                echo "'/models'로 사용 가능한 모델 목록을 확인하세요."
            else
                # 모델 유효성 검사
                if $HAS_JQ; then
                    AVAILABLE_MODELS=$(curl -s "$SERVER_URL/v1/models" 2>/dev/null | jq -r '.data[].id' 2>/dev/null)
                    if [ -n "$AVAILABLE_MODELS" ]; then
                        if echo "$AVAILABLE_MODELS" | grep -qx "$NEW_MODEL"; then
                            MODEL="$NEW_MODEL"
                            echo -e "${YELLOW}모델이 '$MODEL'로 변경되었습니다.${NC}"
                        else
                            echo -e "${RED}오류: '$NEW_MODEL' 모델을 찾을 수 없습니다.${NC}"
                            echo -e "${YELLOW}사용 가능한 모델:${NC}"
                            echo "$AVAILABLE_MODELS"
                            echo -e "현재 모델: ${BLUE}$MODEL${NC}"
                        fi
                    else
                        # 서버 연결 실패 시 경고 후 변경 허용
                        echo -e "${YELLOW}경고: 서버에서 모델 목록을 가져올 수 없습니다.${NC}"
                        MODEL="$NEW_MODEL"
                        echo -e "${YELLOW}모델이 '$MODEL'로 변경되었습니다.${NC}"
                    fi
                else
                    # jq가 없으면 검증 없이 변경
                    MODEL="$NEW_MODEL"
                    echo -e "${YELLOW}모델이 '$MODEL'로 변경되었습니다.${NC}"
                fi
            fi
            continue
            ;;
        /model)
            echo -e "${RED}사용법: /model MODEL_NAME${NC}"
            echo -e "현재 모델: ${BLUE}$MODEL${NC}"
            echo "'/models'로 사용 가능한 모델 목록을 확인하세요."
            continue
            ;;
        /system\ *)
            SYSTEM_PROMPT="${input#/system }"
            MESSAGES='[]'
            add_message "system" "$SYSTEM_PROMPT"
            echo -e "${YELLOW}시스템 프롬프트가 변경되었습니다. 대화 내역이 초기화되었습니다.${NC}"
            continue
            ;;
        /clear)
            MESSAGES='[]'
            if [ -n "$SYSTEM_PROMPT" ]; then
                add_message "system" "$SYSTEM_PROMPT"
            fi
            echo -e "${YELLOW}대화 내역이 초기화되었습니다.${NC}"
            continue
            ;;
        /history)
            echo -e "${YELLOW}대화 내역:${NC}"
            if $HAS_JQ; then
                echo "$MESSAGES" | jq -r '.[] | "\(.role): \(.content)"'
            else
                echo "$MESSAGES"
            fi
            echo ""
            continue
            ;;
        /*)
            echo -e "${RED}알 수 없는 명령어: $input${NC}"
            echo "'/help'를 입력하면 도움말을 볼 수 있습니다."
            continue
            ;;
    esac

    # 사용자 메시지 추가
    add_message "user" "$input"

    # API 호출
    call_api "$MESSAGES"

    # 어시스턴트 응답 저장 (비스트리밍일 때만)
    # 스트리밍에서는 응답을 캡처하기 어려우므로 별도 처리 필요
done
