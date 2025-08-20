const fs = require('fs');
const path = require('path');

function findPkgDir(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 4; i++) {
    const p = path.join(dir, 'package.json');
    if (fs.existsSync(p)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

const pkgDir = findPkgDir(process.cwd());
if (!pkgDir) {
  console.error('ERROR: package.json을 현재 폴더에서 최대 3단계 상위까지 찾지 못했습니다.');
  process.exit(1);
}
const pkgPath = path.join(pkgDir, 'package.json');

const cmd =
  'SRC_DIR="${INIT_CWD:-.}/dist/public"; ' +
  'rsync -az --delete -e "ssh -i ~/.ssh/xpro0" "$SRC_DIR"/ xpro@xpro0.cafe24.com:/srv/xpro0/snaver/.staging/public/ ' +
  '&& ssh -i ~/.ssh/xpro0 xpro@xpro0.cafe24.com \'SRC="/srv/xpro0/snaver/.staging/public" /srv/xpro0/snaver/bin/deploy_static.sh\' ' +
  '&& ASSET="$(basename "$(ssh -i ~/.ssh/xpro0 xpro@xpro0.cafe24.com \'ls -1 /srv/xpro0/snaver/dist/public/assets/index-*.js | head -n1\' 2>/dev/null)")"; ' +
  'curl -sI "https://xpro0.cafe24.com/snaver/assets/$ASSET" | sed -n \'1,8p\'; ' +
  'curl -sI "https://xpro0.cafe24.com/snaver/?v=NOW" | sed -n \'1,8p\'';

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.deploy = cmd;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log('OK: scripts.deploy updated at', pkgPath);
console.log('PKG_DIR=' + pkgDir);
