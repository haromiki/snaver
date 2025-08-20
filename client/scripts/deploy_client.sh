#!/usr/bin/env bash
set -euo pipefail

BASE="${INIT_CWD:-$(pwd)}"

# 후보 경로(순서대로 탐색)
CANDIDATES=(
  "$BASE/../dist/public"
  "$BASE/dist/public"
  "$(pwd)/../dist/public"
  "$(pwd)/dist/public"
  "$(cd "$BASE/.." 2>/dev/null && pwd)/dist/public"
)

SRC_DIR=""
for d in "${CANDIDATES[@]}"; do
  if [ -d "$d" ]; then
    SRC_DIR="$d"
    break
  fi
done

if [ -z "$SRC_DIR" ]; then
  echo "ERR: dist/public 경로를 찾지 못했습니다."
  printf 'Tried:\n'; printf ' - %s\n' "${CANDIDATES[@]}"
  exit 1
fi

# 1) 동기화
rsync -az --delete -e "ssh -i ~/.ssh/xpro0" "$SRC_DIR"/ xpro@xpro0.cafe24.com:/srv/xpro0/snaver/.staging/public/

# 2) 서버 측 배포 스위치
ssh -i ~/.ssh/xpro0 xpro@xpro0.cafe24.com 'SRC="/srv/xpro0/snaver/.staging/public" /srv/xpro0/snaver/bin/deploy_static.sh'

# 3) 스모크 테스트(헤더 2줄)
ASSET="$(basename "$(ssh -i ~/.ssh/xpro0 xpro@xpro0.cafe24.com 'ls -1 /srv/xpro0/snaver/dist/public/assets/index-*.js | head -n1' 2>/dev/null)")"
curl -sI "https://xpro0.cafe24.com/snaver/assets/$ASSET" | sed -n '1,8p'
curl -sI "https://xpro0.cafe24.com/snaver/?v=NOW" | sed -n '1,8p'
