#!/bin/bash
set -e

echo ""
echo "🚀 Snaver 통합 배포 시작"

# ────────────────────────────────────────────────
echo ""
echo "📥 Git 최신 코드 Pull..."
cd /srv/xpro0/snaver
git pull origin main

# ────────────────────────────────────────────────
echo ""
echo "🎨 클라이언트(Vite) 빌드 시작..."
npx vite build --config vite.build.config.ts

# ────────────────────────────────────────────────
echo ""
echo "📤 정적 파일 복사 생략 (이미 dist/public 에 빌드됨)"

# ────────────────────────────────────────────────
echo ""
echo "📦 API 서버 빌드 (esbuild)..."
npx esbuild server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outfile=dist/index.js

# ────────────────────────────────────────────────
echo ""
echo "🛠 DB 스키마 마이그레이션 적용..."
npx drizzle-kit push

# ────────────────────────────────────────────────
echo ""
echo "🔁 PM2 API 서버 재시작..."
pm2 restart snaver-api --update-env

# ────────────────────────────────────────────────
echo ""
echo "💾 PM2 상태 저장 (재부팅 후 자동 복구용)"
pm2 save

# ────────────────────────────────────────────────
echo ""
echo "✅ 배포 후 헬스 체크 (최대 10초 대기)..."
for i in {1..10}; do
  if curl -s --max-time 1 https://podoo.co.kr/api/_health | grep -q '"ok":true'; then
    echo "✅ API 서버 정상 작동 확인됨"
    break
  else
    echo "⏳ API 서버 대기 중... ($i초)"
    sleep 1
  fi
done

# ────────────────────────────────────────────────
echo ""
echo "🔐 인증 API 테스트:"
curl -s https://podoo.co.kr/api/auth/me && echo

# ────────────────────────────────────────────────
echo ""
echo "🎉 전체 배포 완료"
