#!/bin/bash

# Copilot Server 종료 스크립트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# PM2 설치 확인
if ! command -v pm2 &> /dev/null; then
    echo "PM2가 설치되어 있지 않습니다."
    exit 1
fi

# 실행 중인지 확인
if pm2 describe copilot-server &> /dev/null; then
    echo "copilot-server를 종료합니다..."
    pm2 stop copilot-server
    pm2 delete copilot-server
    echo "copilot-server가 종료되었습니다."
else
    echo "copilot-server가 실행 중이 아닙니다."
fi

# 상태 확인
pm2 status
