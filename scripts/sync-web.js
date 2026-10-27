/**
 * 把 D:/A/html/mie/deployment-ready 同步到本工程的 www/
 * 用法: node scripts/sync-web.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../mie/deployment-ready');
const DEST = path.resolve(__dirname, '../www');

// 不需要进 App 的东西（减小包体、避免无用报错）
const SKIP = new Set([
  'deployment-ready',      // 防止自我递归
  'hidden-letters',        // 依赖电脑上的 node 服务，App 里跑不了
  'music-server',
  'dylan-heartbeat',
  'tools',
  'node_modules',
  '.git',
]);

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isSymbolicLink()) continue;
    else fs.copyFileSync(s, d);
  }
}

function sizeOf(p) {
  let total = 0;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, entry.name);
    if (entry.isDirectory()) total += sizeOf(f);
    else total += fs.statSync(f).size;
  }
  return total;
}

if (!fs.existsSync(SRC)) {
  console.error('找不到源目录:', SRC);
  process.exit(1);
}

rmrf(DEST);
copyDir(SRC, DEST);

// 把原生桥脚本插进 index.html（只插一次）
const indexPath = path.join(DEST, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('native-bridge.js')) {
  html = html.replace(
    /(<\/body>)/i,
    '  <script src="js/native-bridge.js"></script>\n$1'
  );
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('已注入 native-bridge.js');
}

const bridge = path.resolve(__dirname, '../native/native-bridge.js');
if (fs.existsSync(bridge)) {
  fs.copyFileSync(bridge, path.join(DEST, 'js/native-bridge.js'));
  console.log('已复制 native/native-bridge.js');
}

// 通知铃声必须放在网页资源根目录：插件会去 App.app/public/ 里按文件名找
const ring = path.resolve(__dirname, '../native/ring.wav');
if (fs.existsSync(ring)) {
  fs.copyFileSync(ring, path.join(DEST, 'ring.wav'));
  console.log('已复制 native/ring.wav');
}

console.log('同步完成 ->', DEST, (sizeOf(DEST) / 1024 / 1024).toFixed(1) + ' MB');
