// ---------------------------------------------------------------------------
// audio.js —— 纯合成音效引擎
// 不依赖任何音频资源文件：所有声音用 Web Audio 现场合成（振荡器 / 噪声 / 滤波 / 包络），
// 这样单文件产物 pachinko-drop.html 依然是一个自包含的 HTML。
// ---------------------------------------------------------------------------

const MUTE_KEY = 'pachinko.sfx.muted';
const MASTER_VOL = 0.9;

let ac = null;
let master = null;       // 总音量（静音开关作用在这里）
let bus = null;          // 音效总线
let ambBus = null;       // 环境底噪总线
let noiseBuf = null;
let muted = false;
let ambStarted = false;

let pegWinStart = 0;
let pegBurst = 0;
let dragStep = -1;

// ---------------------------------------------------------------------------
// 基础设施
// ---------------------------------------------------------------------------
function readMute() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
function writeMute(v) {
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

function makeNoise() {
  const n = Math.floor(ac.sampleRate * 1.5);
  const b = ac.createBuffer(1, n, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ac = new AC(); } catch { return null; }

  muted = readMute();

  // 限幅器：撞击声会瞬间叠很多层，压一下避免削波失真
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 8;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  master = ac.createGain();
  master.gain.value = muted ? 0 : MASTER_VOL;
  comp.connect(master).connect(ac.destination);

  bus = ac.createGain();
  bus.gain.value = 1.0;
  bus.connect(comp);

  ambBus = ac.createGain();
  ambBus.gain.value = 1.0;
  ambBus.connect(comp);

  noiseBuf = makeNoise();
  return ac;
}

const live = () => ac && !muted;

/** 单个振荡器音：可指定起止频率（指数滑音） */
function blip(t, { f, f2 = null, type = 'sine', dur = 0.08, vol = 0.1, attack = 0.003, dest = bus }) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, f), t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.00001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.00001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** 噪声爆：带通 / 高通 / 低通，可扫频（撞击感、摩擦、气流） */
function nz(t, { dur = 0.05, vol = 0.08, type = 'highpass', freq = 1200, q = 1, sweepTo = null, dest = bus }) {
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const flt = ac.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(freq, t);
  flt.Q.value = q;
  if (sweepTo) flt.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.00001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.00001, t + dur);
  s.connect(flt).connect(g).connect(dest);
  s.start(t, Math.random() * 0.8);
  s.stop(t + dur + 0.03);
}

// ---------------------------------------------------------------------------
// 环境底噪（机厅低鸣）：两组低频 pad + 一丝空调噪声，缓慢呼吸
// ---------------------------------------------------------------------------
function startAmbience() {
  if (!ac || ambStarted) return;
  ambStarted = true;

  const out = ac.createGain();
  out.gain.value = 0.00001;
  out.connect(ambBus);
  out.gain.linearRampToValueAtTime(1, ac.currentTime + 4);

  [[55, 0.012], [82.41, 0.008], [110, 0.005], [164.8, 0.003]].forEach(([f, v], i) => {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = (i - 1.5) * 5;
    const g = ac.createGain();
    g.gain.value = v;
    // 极慢的呼吸，避免死板的电子嗡鸣
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.027;
    const lg = ac.createGain();
    lg.gain.value = v * 0.55;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(out);
    o.start(); lfo.start();
  });

  // 空调风声
  const s = ac.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const flt = ac.createBiquadFilter();
  flt.type = 'bandpass'; flt.frequency.value = 900; flt.Q.value = 0.6;
  const g = ac.createGain(); g.gain.value = 0.006;
  s.connect(flt).connect(g).connect(out);
  s.start();
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------
function unlock() {
  ensure();
  if (!ac) return;
  if (ac.state === 'suspended') {
    try {
      const p = ac.resume();
      if (p && p.catch) p.catch(() => { /* 没有可用的输出设备时忽略 */ });
    } catch { /* ignore */ }
  }
  startAmbience();
}

function isMuted() { return muted; }

function applyMute() {
  if (!ac) return;
  const t = ac.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, t, 0.04);
}

function setMuted(v) {
  muted = !!v;
  writeMute(muted);
  if (ac) applyMute();
  return muted;
}
function toggle() { return setMuted(!muted); }

// ---- UI 点击 ----
function click() {
  if (!live()) return;
  const t = ac.currentTime + 0.001;
  blip(t, { f: 1180, f2: 880, dur: 0.045, type: 'triangle', vol: 0.045 });
  nz(t, { dur: 0.02, vol: 0.02, type: 'highpass', freq: 3000 });
}

// ---- 本局开始：点亮出口的开机音（电流上扫 + 逐颗亮灯）----
function round(litCount = 1) {
  if (!live()) return;
  const t = ac.currentTime + 0.02;
  blip(t, { f: 88, f2: 196, dur: 0.34, type: 'sawtooth', vol: 0.022, attack: 0.06 });
  nz(t, { dur: 0.3, vol: 0.022, type: 'bandpass', freq: 800, q: 1.6, sweepTo: 2600 });
  const n = Math.max(1, Math.min(4, litCount));
  for (let i = 0; i < n; i++) {
    blip(t + 0.2 + i * 0.075, { f: 1240 + i * 180, dur: 0.1, type: 'sine', vol: 0.032 });
  }
}

// ---- 钢珠撞钉：金属"叮"，两个非谐泛音 + 一点硬噪 ----
function peg(v) {
  if (!live()) return;
  const now = performance.now();
  if (now - pegWinStart > 90) { pegWinStart = now; pegBurst = 0; }
  if (pegBurst >= 5) return;         // 密集撞钉时限流，别糊成噪音墙
  pegBurst++;

  const t = ac.currentTime + 0.001;
  const k = Math.min(1, v / 3);
  const f = 1050 + Math.random() * 550 + k * 950;
  const vol = 0.032 + k * 0.05;
  blip(t, { f, dur: 0.075, type: 'sine', vol });
  blip(t, { f: f * 2.76, dur: 0.038, type: 'sine', vol: vol * 0.4 });
  blip(t, { f: f * 4.13, dur: 0.022, type: 'sine', vol: vol * 0.2 });
  if (k > 0.3) nz(t, { dur: 0.028, vol: 0.05 * k, type: 'highpass', freq: 2800 });
}

// ---- 投币：游戏币滑入投币口（金属摩擦声 → 落底"叮" + 闷响）----
function coinIns() {
  if (!live()) return;
  const t = ac.currentTime + 0.001;
  nz(t, { dur: 0.15, vol: 0.045, type: 'bandpass', freq: 2600, q: 3, sweepTo: 900 });  // 币身刮过缝口
  blip(t + 0.015, { f: 3400, f2: 2500, dur: 0.05, type: 'triangle', vol: 0.028 });     // 金属拨动
  blip(t + 0.14, { f: 1560, f2: 1180, dur: 0.10, type: 'sine', vol: 0.05 });           // 落底"叮"
  blip(t + 0.15, { f: 2340, dur: 0.05, type: 'sine', vol: 0.02 });
  nz(t + 0.14, { dur: 0.06, vol: 0.03, type: 'lowpass', freq: 500 });                  // 落袋闷响
}

// ---- 筹码球入洞：金属币落袋，音高随装填进度往上爬（连击感）----
function chip(i = 0) {
  if (!live()) return;
  const t = ac.currentTime + 0.001;
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const semi = scale[Math.min(scale.length - 1, i % scale.length)];
  const f = 760 * Math.pow(2, semi / 12);
  blip(t, { f: f * 1.6, f2: f, dur: 0.1, type: 'triangle', vol: 0.05 });
  blip(t, { f: f * 3.02, dur: 0.045, type: 'sine', vol: 0.022 });
  nz(t, { dur: 0.04, vol: 0.028, type: 'bandpass', freq: 4400, q: 2.2 });
}

// ---- 筹码球落进受皿：一堆金属小球互相磕碰的密集碎响 ----
let trayWinStart = 0, trayBurst = 0;
function trayDrop(v = 1) {
  if (!live()) return;
  const now = performance.now();
  if (now - trayWinStart > 110) { trayWinStart = now; trayBurst = 0; }
  if (trayBurst >= 3) return;          // 一次落一片，限流成"哗啦"而不是噪音墙
  trayBurst++;
  const t = ac.currentTime + 0.001;
  const k = Math.min(1, v);
  const f = 1450 + Math.random() * 900;
  const vol = 0.016 + k * 0.018;
  blip(t, { f, dur: 0.055, type: 'sine', vol });
  blip(t, { f: f * 1.61, dur: 0.032, type: 'sine', vol: vol * 0.45 });
  nz(t, { dur: 0.032, vol: 0.014 + k * 0.012, type: 'bandpass', freq: 3100, q: 2.2 });
}

// ---- 拉杆：拖动时的棘轮咔哒（按力度分档）----
function dragTick(p) {
  if (!live()) return;
  const step = Math.floor(p * 8);
  if (step === dragStep) return;
  dragStep = step;
  const t = ac.currentTime + 0.001;
  blip(t, { f: 300 + p * 620, dur: 0.028, type: 'triangle', vol: 0.02 });
  nz(t, { dur: 0.02, vol: 0.014, type: 'bandpass', freq: 2600, q: 3 });
}
function dragReset() { dragStep = -1; }

// ---- 弹射：弹簧释放的"嘣" + 钢珠冲出轨道的气流 ----
function launch(power = 0.5) {
  dragStep = -1;
  if (!live()) return;
  const t = ac.currentTime + 0.001;
  blip(t, { f: 190, f2: 58, dur: 0.18, type: 'sine', vol: 0.17 });
  blip(t, { f: 320, f2: 120, dur: 0.1, type: 'triangle', vol: 0.06 });
  nz(t, { dur: 0.13, vol: 0.1, type: 'bandpass', freq: 2000, q: 0.9, sweepTo: 620 });
  blip(t + 0.012, { f: 240 + power * 200, f2: 820 + power * 900, dur: 0.24, type: 'sawtooth', vol: 0.03 });
  nz(t + 0.01, { dur: 0.26, vol: 0.03, type: 'highpass', freq: 1400, sweepTo: 5200 });
}

// ---- 钢珠落进出口槽 ----
function land(v = 1) {
  if (!live()) return;
  const t = ac.currentTime + 0.001;
  const k = Math.min(1, v / 4);
  blip(t, { f: 420 + Math.random() * 120, f2: 210, dur: 0.13, type: 'triangle', vol: 0.055 + k * 0.03 });
  nz(t, { dur: 0.09, vol: 0.06, type: 'bandpass', freq: 1700, q: 1.2, sweepTo: 700 });
}

// ---- 中奖：琶音 + 低音支撑 + 金币雨（倍率越高越盛）----
function win(mult = 2) {
  if (!live()) return;
  const t = ac.currentTime + 0.02;
  const big = mult >= 6;
  const huge = mult >= 10;
  const root = huge ? 587.33 : big ? 523.25 : 440;
  const seq = big ? [0, 4, 7, 11, 12, 16, 19, 24] : [0, 4, 7, 12];
  const step = big ? 0.068 : 0.086;

  seq.forEach((s, i) => {
    const tt = t + i * step;
    const f = root * Math.pow(2, s / 12);
    blip(tt, { f, dur: 0.3, type: 'triangle', vol: 0.072 });
    blip(tt, { f: f * 2, dur: 0.16, type: 'sine', vol: 0.028 });
  });

  blip(t, { f: root / 2, dur: 0.55, type: 'sine', vol: 0.1, attack: 0.01 });
  nz(t, { dur: 0.36, vol: 0.055, type: 'highpass', freq: 300, sweepTo: 4200 });

  if (big) {
    blip(t + 0.02, { f: 280, f2: 2300, dur: 0.55, type: 'sawtooth', vol: 0.026, attack: 0.02 });
    blip(t + 0.06, { f: root, f2: root * 2, dur: 0.7, type: 'sine', vol: 0.05, attack: 0.02 });
  }
  if (huge) {
    blip(t + 0.3, { f: root * 2, f2: root * 4, dur: 0.6, type: 'triangle', vol: 0.045 });
  }

  // 金币雨：随机高频短音撒在半秒到一秒里
  const coins = huge ? 30 : big ? 22 : 14;
  const span = huge ? 1.2 : big ? 0.9 : 0.55;
  for (let i = 0; i < coins; i++) {
    const tt = t + 0.08 + Math.random() * span;
    const f = 2200 + Math.random() * 2600;
    blip(tt, { f, dur: 0.04 + Math.random() * 0.06, type: 'sine', vol: 0.012 + Math.random() * 0.014 });
  }
}

// ---- 未命中：往下坠的闷响 ----
function lose() {
  if (!live()) return;
  const t = ac.currentTime + 0.02;
  blip(t, { f: 210, f2: 108, dur: 0.34, type: 'sine', vol: 0.085 });
  blip(t + 0.07, { f: 152, f2: 68, dur: 0.42, type: 'triangle', vol: 0.05 });
  nz(t, { dur: 0.22, vol: 0.028, type: 'lowpass', freq: 420 });
}

export const audio = {
  unlock, isMuted, setMuted, toggle,
  click, round, peg, chip, coinIns, trayDrop, dragTick, dragReset, launch, land, win, lose,
};
