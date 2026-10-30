// 回读导出的 GLB 并截图：node tools/verify_glb.mjs [glb相对脚本路径]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';

// 相对站点根目录（E:/pachinko-3d）；注意 Git Bash 会把以 / 开头的参数转成 Windows 路径
const GLB = '/' + (process.argv[2] || 'models/pachinko_machine.glb').replace(/^\/+/, '');
const SHOT = process.argv[3] || resolve(import.meta.dirname, '..', '..', 'models', 'preview_machine.png');
const PORT = 9334;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WEB_ROOT = resolve(ROOT, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  if (process.env.CDP_DEBUG) console.log('REQ', req.url);
  const p = resolve(WEB_ROOT, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(WEB_ROOT)) { res.writeHead(403).end(); return; }
  try {
    if (!statSync(p).isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    createReadStream(p).pipe(res);
  } catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const WEB_PORT = server.address().port;
mkdirSync(resolve(ROOT, '..', 'models'), { recursive: true });

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${resolve(ROOT, '.edgeprof_verify')}`,
  '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=900,900', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
});

async function main() {
  let url0;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { url0 = (await r.json()).webSocketDebuggerUrl; break; } } catch {}
    await sleep(200);
  }
  if (!url0) throw new Error('Edge CDP 没起来');
  ws = new WebSocket(url0);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (process.env.CDP_DEBUG && m.method === 'Runtime.consoleAPICalled') {
      console.log('console:', (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (process.env.CDP_DEBUG && m.method === 'Log.entryAdded') console.log('log:', m.params.entry.text);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);
  const page = `http://127.0.0.1:${WEB_PORT}/pachinko3d/verify.html?glb=` + encodeURIComponent(GLB);
  await send('Page.navigate', { url: page }, sessionId);

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 120000) {
    await sleep(800);
    const err = await evalJS('window.__ERR || null').catch(() => null);
    if (err) throw new Error('GLB 读取失败: ' + err);
    ok = await evalJS('!!window.__OK').catch(() => false);
    if (ok) break;
  }
  if (!ok) throw new Error('校验页超时');
  await sleep(600);
  const info = await evalJS('window.__INFO');
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(SHOT, Buffer.from(data, 'base64'));
  console.log('OK', JSON.stringify(info));
  console.log('shot', SHOT);
}

main().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; })
  .finally(async () => { try { ws && ws.close(); } catch {} try { child.kill(); } catch {} await sleep(400); process.exit(); });
