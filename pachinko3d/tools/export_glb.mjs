// 用真实 Edge（无头）打开 export.html，触发 GLB 下载并落到 dist/ 目录。
// 用法：node tools/export_glb.mjs [machine|scene] [maxtex]
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TARGET = process.argv[2] || 'machine';
const MAXTEX = process.argv[3] || '2048';
const PORT = 9333;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, '..', 'models');   // 给引擎用的产物放仓库根 models/
const PROFILE = resolve(ROOT, '.edgeprof_export');

mkdirSync(OUT, { recursive: true });
// 清掉同名旧文件，避免拿到上次的产物
const wantName = (TARGET === 'scene' ? 'pachinko_scene' : 'pachinko_machine') + '.glb';
try { rmSync(join(OUT, wantName), { force: true }); } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,800',
  'about:blank',
];
const child = spawn(EDGE, args, { stdio: 'ignore', detached: false });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
});

const sleep2 = sleep;
async function waitEndpoint() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep2(200);
  }
  throw new Error('Edge CDP 端口没起来');
}

async function main() {
  const wsUrl = await waitEndpoint();
  ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      events.push(msg);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const txt = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        if (txt.startsWith('[export]')) console.log('edge:', txt);
      }
    }
  };

  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT, eventsEnabled: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);

  const url = 'file:///' + resolve(ROOT, 'export.html').replace(/\\/g, '/')
    + `?export=${TARGET}&maxtex=${MAXTEX}`;
  await send('Page.navigate', { url }, sessionId);

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  let info = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await sleep2(1000);
    const err = await evalJS('window.__EXPORT_ERROR || null').catch(() => null);
    if (err) throw new Error('浏览器内导出失败: ' + err);
    const done = await evalJS('!!window.__EXPORT_DONE').catch(() => false);
    if (done) { info = await evalJS('window.__EXPORT_INFO'); break; }
    const info0 = await evalJS('window.__EXPORT_INFO || null').catch(() => null);
    if (info0 && !info) console.log('scene:', JSON.stringify(info0));
  }
  if (!info) throw new Error('导出超时');

  // 等下载落地并稳定
  let size = 0;
  for (let i = 0; i < 120; i++) {
    await sleep2(500);
    const p = join(OUT, wantName);
    if (existsSync(p)) {
      const s = statSync(p).size;
      if (s > 0 && s === size) break;
      size = s;
    }
  }
  const p = join(OUT, wantName);
  console.log('done:', info.file, existsSync(p) ? (statSync(p).size / 1024 / 1024).toFixed(2) + ' MB' : '文件未落地');
  console.log('stats:', JSON.stringify(info));
  console.log('dist:', readdirSync(OUT).join(', '));
}

main()
  .catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; })
  .finally(async () => {
    try { ws && ws.close(); } catch {}
    try { child.kill(); } catch {}
    await sleep(500);
    process.exit();
  });
