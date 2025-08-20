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
if (!pkgDir) { console.error('package.json not found'); process.exit(1); }
const pkgPath = path.join(pkgDir, 'package.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
// INIT_CWD 기준으로 client/scripts/deploy_client.sh 실행
pkg.scripts.deploy = 'bash -lc \'DIR="${INIT_CWD:-$(pwd)}"; bash "$DIR/scripts/deploy_client.sh"\'';
// deploy:all은 유지(없으면 추가)
pkg.scripts["deploy:all"] = pkg.scripts["deploy:all"] || "npm run build && npm run deploy";

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('OK: scripts.deploy updated to INIT_CWD-aware at', pkgPath);
