#!/bin/bash

# Copilot Server 시작 스크립트
# PM2를 사용하여 데몬으로 실행

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# PM2 설치 확인
if ! command -v pm2 &> /dev/null; then
    echo "PM2가 설치되어 있지 않습니다. 설치 중..."
    npm install -g pm2
fi

# 이미 실행 중인지 확인
if pm2 describe copilot-server &> /dev/null; then
    echo "copilot-server가 이미 실행 중입니다. 재시작합니다..."
    pm2 restart copilot-server
else
    echo "copilot-server를 시작합니다..."
    pm2 start src/index.js --name copilot-server --time
fi

# 상태 확인
pm2 status copilot-server

# 부팅 시 자동 시작 설정 안내
echo ""
echo "부팅 시 자동 시작을 설정하려면 다음 명령을 실행하세요:"
echo "  pm2 startup"
echo "  pm2 save"
