/**
 * Development only: `npm run preview` serves the web preview of the app cross-origin isolated.
 *
 * Why: on the web, `expo-sqlite` runs SQLite as WebAssembly and needs `SharedArrayBuffer`, which a
 * browser gives only to pages served with `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy`. The Expo CLI adds those headers to Metro's bundle responses
 * (metro.config.js) but not to the HTML page it serves itself. This script starts the Expo web
 * server on an internal port and puts a small proxy in front of it that adds both headers to every
 * response, then forwards everything else untouched (including the hot-reload WebSocket).
 *
 * Nothing here ships in the app: it is not imported by `src/` and only uses Node's built-ins.
 *
 *   npm run preview            -> http://localhost:8082  (Expo on 8081)
 *   PREVIEW_PORT=9000 EXPO_PORT=9001 npm run preview
 *
 * Stop it with Ctrl+C; that also stops the Expo server it started.
 */
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const expoPort = Number(process.env.EXPO_PORT ?? 8081);
const previewPort = Number(process.env.PREVIEW_PORT ?? 8082);
const isWindows = process.platform === 'win32';

const expo = spawn(isWindows ? 'npx.cmd' : 'npx', ['expo', 'start', '--web', '--port', String(expoPort)], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: isWindows,
  env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
});

function stopExpo() {
  if (expo.exitCode !== null || expo.pid === undefined) return;
  if (isWindows) spawnSync('taskkill', ['/pid', String(expo.pid), '/T', '/F'], { stdio: 'ignore' });
  else expo.kill('SIGTERM');
}

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

const proxy = http.createServer((req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: expoPort, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${expoPort}` } },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, { ...answer.headers, ...isolation });
      answer.pipe(res);
    },
  );
  upstream.on('error', () => {
    // Expo is still starting (or has stopped): say so instead of hanging.
    res.writeHead(503, { 'Content-Type': 'text/plain', 'Retry-After': '2', ...isolation });
    res.end('The Expo web server is not ready yet. Reload in a few seconds.');
  });
  req.pipe(upstream);
});

// Hot reload uses a WebSocket: pipe the raw sockets through.
proxy.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(expoPort, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

proxy.listen(previewPort, '127.0.0.1', () => {
  console.log(`\nPreview (cross-origin isolated): http://localhost:${previewPort}\n`);
});

function shutdown() {
  proxy.close();
  stopExpo();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', stopExpo);
expo.on('exit', (code) => {
  proxy.close();
  process.exit(code ?? 0);
});
