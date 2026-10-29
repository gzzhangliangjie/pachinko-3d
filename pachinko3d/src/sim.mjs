import * as CANNON from 'cannon-es';
import { CFG, buildPhysicsWorld, createBall, nudge, slotIndexFromX, slotWidth } from './layout.mjs';

const TILT = CFG.tiltDeg * Math.PI / 180;
const localY = (wy, wz) => Math.cos(TILT) * wy - Math.sin(TILT) * wz;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function runSim(trials = 2000, seed = 12345, cfg = CFG) {
  const rng = mulberry32(seed);
  const hist = new Array(cfg.slotCount).fill(0);
  let leaks = 0, stuck = 0, totalTime = 0;

  const { world, matBall } = buildPhysicsWorld(cfg);

  for (let t = 0; t < trials; t++) {
    const x0 = cfg.spawnX + (rng() * 2 - 1) * 0.012;
    const ball = createBall(world, cfg, matBall, x0, (rng() * 2 - 1) * 0.18, rng);
    let resolved = false, time = 0;
    const dt = 1 / 240;
    let stillFor = 0, lastY = 1e9;

    for (let step = 0; step < 240 * 8; step++) {
      world.step(dt);
      if (step % 48 === 0) nudge(ball, rng);
      time += dt;
      const ly = localY(ball.position.y, ball.position.z);
      if (ly < -0.93) {
        hist[slotIndexFromX(ball.position.x, cfg)]++;
        resolved = true;
        break;
      }
      if (Math.abs(ball.position.x) > cfg.boardW / 2 + 0.05) { leaks++; resolved = true; break; }
      if (Math.abs(ball.position.y - lastY) < 0.0008) stillFor += dt; else stillFor = 0;
      lastY = ball.position.y;
      if (stillFor > 1.2) { stuck++; resolved = true; break; }
    }
    if (!resolved) stuck++;
    world.removeBody(ball);
    totalTime += time;
  }

  const landed = hist.reduce((a, b) => a + b, 0);
  return { hist, leaks, stuck, landed, avgTime: totalTime / trials };
}

// ---- 倍数模型：3 个出口点亮，倍数按权重不放回抽取 ----
const MULT = [2, 4, 6, 8, 10];
const W = [0.63, 0.235, 0.08, 0.04, 0.015];

// 每个点亮出口独立抽倍数（有放回），E[M] 即权重均值
export function expectationOfThree(weights = W, mult = MULT) {
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.reduce((acc, w, i) => acc + (w / sum) * mult[i], 0);
}

// 单次抽 3 个倍数（不放回），供游戏使用
export const MULT_WEIGHTS = W;
export const MULT_VALUES = MULT;

export function drawMultiplier(rng = Math.random, weights = W, mult = MULT) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return mult[i];
  }
  return mult[mult.length - 1];
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('sim.mjs')) {
  const t0 = Date.now();
  const res = runSim(400);
  const landed = res.landed || 1;
  console.log('== 落点分布 ==');
  res.hist.forEach((h, i) => {
    const p = h / landed;
    console.log(`slot ${i}: ${(p * 100).toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(p * 60))}`);
  });
  console.log(`landed=${res.landed} leaks=${res.leaks} stuck=${res.stuck} avgFall=${res.avgTime.toFixed(2)}s`);
  console.log('landed - leaks - stuck =', res.landed - res.leaks - res.stuck);
  const em = expectationOfThree();
  console.log(`E[mult] = ${em.toFixed(4)}  => RTP = 0.3 * E = ${(0.3 * em * 100).toFixed(2)}%`);
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
