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
// 기존 build, deploy 그대로 활용해서 연쇄 실행
pkg.scripts["deploy:all"] = "npm run build && npm run deploy";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('OK: scripts.deploy:all added at', pkgPath);
