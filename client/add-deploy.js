const fs = require('fs');
const pkgPath = 'package.json';
const cmd = 'rsync -az --delete -e "ssh -i ~/.ssh/xpro0" ../dist/public/ xpro@podoo.co.kr:/srv/xpro0/snaver/.staging/public/ && ssh -i ~/.ssh/xpro0 xpro@podoo.co.kr \'SRC="/srv/xpro0/snaver/.staging/public" /srv/xpro0/snaver/bin/deploy_static.sh\' && ASSET="$(basename "$(ssh -i ~/.ssh/xpro0 xpro@podoo.co.kr \'ls -1 /srv/xpro0/snaver/dist/public/assets/index-*.js | head -n1\' 2>/dev/null)")"; curl -sI "https://podoo.co.kr/snaver/assets/$ASSET" | sed -n \'1,8p\'; curl -sI "https://podoo.co.kr/snaver/?v=NOW" | sed -n \'1,8p\'';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.deploy = cmd;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('OK: scripts.deploy added to package.json');
