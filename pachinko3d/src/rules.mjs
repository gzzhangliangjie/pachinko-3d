// 规则与赔率模型（游戏与仿真共用同一份参数）
// 8 个出口；每局随机点亮 1~4 个（出口越少倍率越高），全局面板统一一个基础倍率，最高 10×
export const SLOT_COUNT = 8;

// 倍率下限按"命中率"定：n 个出口点亮时命中率 = n/8，公平倍数 = 8/n
//   n=4 → 公平 2x（所以 4 口最低 2x，偶尔升 4x）
//   n=3 → 公平 2.67x（2x 为主，少量 4x）
//   n=2 → 公平 4x（所以 2 口最低 4x，偶尔 6x）
//   n=1 → 公平 8x（6x/8x/10x）
export const LIT_TABLE = [
  // n,  p,    [2x,4x,6x,8x,10x] 权重
  { n: 4, p: 0.46, w: [0.98, 0.02, 0.00, 0.00, 0.00] },
  { n: 3, p: 0.22, w: [0.86, 0.14, 0.00, 0.00, 0.00] },
  { n: 2, p: 0.21, w: [0.00, 0.96, 0.04, 0.00, 0.00] },
  { n: 1, p: 0.11, w: [0.00, 0.00, 0.62, 0.26, 0.12] },
];
export const MULT_VALUES = [2, 4, 6, 8, 10];

export function drawRound(rng = Math.random) {
  let r = rng() * LIT_TABLE.reduce((a, b) => a + b.p, 0);
  let row = LIT_TABLE[LIT_TABLE.length - 1];
  for (const t of LIT_TABLE) { r -= t.p; if (r <= 0) { row = t; break; } }

  const idx = [...Array(SLOT_COUNT).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const slots = idx.slice(0, row.n);

  let m = rng() * row.w.reduce((a, b) => a + b, 0);
  let mult = MULT_VALUES[MULT_VALUES.length - 1];
  for (let i = 0; i < row.w.length; i++) { m -= row.w[i]; if (m <= 0) { mult = MULT_VALUES[i]; break; } }

  return { slots, mult, litCount: row.n };
}

export function expectedMult() {
  let acc = 0, pAll = 0;
  for (const t of LIT_TABLE) {
    const wsum = t.w.reduce((a, b) => a + b, 0);
    acc += t.p * t.w.reduce((s, w, i) => s + w / wsum * MULT_VALUES[i], 0);
    pAll += t.p;
  }
  return acc / pAll;
}

/** 理论 RTP = Σ P(N) · (N/8) · E[M|N] */
export function theoreticalRtp() {
  let rtp = 0;
  for (const t of LIT_TABLE) {
    const wsum = t.w.reduce((a, b) => a + b, 0);
    const em = t.w.reduce((s, w, i) => s + w / wsum * MULT_VALUES[i], 0);
    rtp += t.p * (t.n / SLOT_COUNT) * em;
  }
  return rtp;
}
