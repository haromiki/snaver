#!/bin/bash
# SNAVER 푸시 + 실서버 배포 통합 스크립트
# 사용법: ./snaver_deploy.sh "커밋 메시지"

set -e

echo "🚀 SNAVER 푸시 + 배포 시작"

# 커밋 메시지 확인
if [ -z "$1" ]; then
    echo "❌ 커밋 메시지를 입력해주세요."
    echo "사용법: ./snaver_deploy.sh \"커밋 메시지\""
    exit 1
fi

COMMIT_MESSAGE="$1"

echo "📝 커밋 메시지: $COMMIT_MESSAGE"

# 1단계: 로컬 푸시
echo ""
echo "=== 1단계: 로컬 푸시 ==="
git add .
git commit -m "$COMMIT_MESSAGE"
git push origin main
echo "✅ GitHub 푸시 완료"

# 2단계: 실서버 배포
echo ""
echo "=== 2단계: 실서버 배포 ==="
echo "🌐 실서버에 연결하여 배포 중..."

ssh xpro@xpro0.cafe24.com << 'EOF'
cd snaver
echo "📥 최신 코드 pull..."
git pull origin main
echo "🚀 배포 스크립트 실행..."
./snaver_upload.sh
EOF

echo ""
echo "🎉 전체 배포 완료!"
echo "🔗 웹사이트: https://xpro0.cafe24.com/snaver/"
