#!/bin/bash

# Copilot/Claude Server 시작 스크립트
# PM2를 사용하여 데몬으로 실행

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# .env 파일 로드 (SERVICE 변수 확인용)
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# SERVICE 기본값: copilot
SERVICE="${SERVICE:-copilot}"

echo "서비스 모드: $SERVICE"

# CLI 설치 확인 (서비스에 따라)
if [ "$SERVICE" = "claude" ]; then
    # Claude CLI 확인
    if ! claude --version &> /dev/null; then
        echo "=========================================="
        echo "  Claude CLI가 설치되어 있지 않습니다."
        echo "=========================================="
        echo ""
        echo "설치 방법:"
        echo "  npm install -g @anthropic-ai/claude-code"
        echo ""
        echo "설치 후 다시 실행해 주세요."
        exit 1
    fi
    echo "Claude CLI 버전: $(claude --version)"
else
    # GitHub Copilot CLI 확인
    if ! copilot -v &> /dev/null; then
        echo "=========================================="
        echo "  GitHub Copilot CLI가 설치되어 있지 않습니다."
        echo "=========================================="
        echo ""
        echo "설치 방법:"
        echo "  npm install -g @github/copilot"
        echo ""
        echo "설치 후 다시 실행해 주세요."
        exit 1
    fi
    echo "GitHub Copilot CLI 버전: $(copilot -v)"
fi

# PM2 설치 확인
if ! command -v pm2 &> /dev/null; then
    echo "PM2가 설치되어 있지 않습니다. 설치 중..."
    npm install -g pm2
fi

# 의존성 설치/업데이트
echo "의존성 확인 및 업데이트 중..."
npm install

# 이미 실행 중인지 확인
if pm2 describe copilot-server &> /dev/null; then
    echo "copilot-server가 이미 실행 중입니다. 재시작합니다..."
    pm2 restart copilot-server --update-env
else
    echo "copilot-server를 시작합니다..."
    pm2 start ecosystem.config.js
fi

# 상태 확인
pm2 status copilot-server

# 부팅 시 자동 시작 설정 안내
echo ""
echo "부팅 시 자동 시작을 설정하려면 다음 명령을 실행하세요:"
echo "  pm2 startup"
echo "  pm2 save"
