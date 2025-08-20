const fs = require('fs');
const path = require('path');

const searchDirs = ['.', './client', './apps/client', './packages/client'];
const cand = ['vite.config.ts','vite.config.js','vite.config.mjs','vite.config.cjs'];

let target = null;
for (const dir of searchDirs) {
  for (const f of cand) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) { target = p; break; }
  }
  if (target) break;
}

if (!target) {
  target = path.join('.', 'vite.config.js');
  fs.writeFileSync(target,
`import { defineConfig } from 'vite';
export default defineConfig({
  base: '/snaver/',
  build: { outDir: '../dist/public', assetsDir: 'assets' }
});
`);
  console.log('created vite.config.js with base=/snaver/ and outDir=../dist/public');
  process.exit(0);
}

let s = fs.readFileSync(target, 'utf8');
const before = s;

// base
if (/base\s*:\s*['"]\//.test(s)) {
  s = s.replace(/base\s*:\s*['"][^'"]*['"]/, `base: '/snaver/'`);
} else {
  s = s.replace(/defineConfig\s*\(\s*\{/, m => `${m}\n  base: '/snaver/',`);
}

// build.outDir / assetsDir
if (!/build\s*:\s*\{/.test(s)) {
  s = s.replace(/defineConfig\s*\(\s*\{/, m => `${m}\n  build: { outDir: '../dist/public', assetsDir: 'assets' },`);
} else {
  s = s.replace(/outDir\s*:\s*['"][^'"]*['"]/, `outDir: '../dist/public'`);
  if (!/assetsDir\s*:/.test(s)) {
    s = s.replace(/build\s*:\s*\{([^}]*)\}/, (m, inner) => `build: { ${inner.replace(/\s+$/,'')}, assetsDir: 'assets' }`);
  }
}

if (s !== before) {
  fs.writeFileSync(target + '.bak', before);
  fs.writeFileSync(target, s);
  console.log('updated', target, '→ base=/snaver/, outDir=../dist/public');
} else {
  console.log('no changes needed in', target);
}
