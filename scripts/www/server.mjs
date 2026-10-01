// 看谱Pro 本地静态服务器
// 用法: node server.mjs [端口]
// 作用: 通过 http:// 打开页面。液态玻璃必须走 http，
//       直接双击 index.html (file://) 会被浏览器安全策略拦掉。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const START_PORT = Number(process.argv[2]) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.mp3':  'audio/mpeg',
  '.mp4':  'video/mp4',
  '.pdf':  'application/pdf',
  '.mxl':  'application/vnd.recordare.musicxml',
  '.musicxml':'application/vnd.recordare.musicxml'
};

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400); res.end('bad request'); return; }

  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel));

  // 防目录穿越
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + rel);
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(file).pipe(res);
});

// 端口被占用时自动往后找
function listen(port, tries = 0) {
  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && tries < 20) {
      listen(port + 1, tries + 1);
    } else {
      console.error('启动失败:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/index.html`;
    console.log('');
    console.log('  看谱Pro 已启动');
    console.log('  ' + url);
    console.log('');
    console.log('  按 Ctrl+C 停止');
    console.log('');
    if (process.argv[2] === undefined) openBrowser(url);
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false }).unref();
}

listen(START_PORT);
