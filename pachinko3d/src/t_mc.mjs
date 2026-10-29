// 弹射轨道蒙特卡洛：随机力道 + 微小横向抖动，统计 8 个出口的落点分布
// 用法: node src/t_mc.mjs [局数]
import * as CANNON from 'cannon-es';
import { CFG, buildPhysicsWorld, createBallAt, localDir, slotIndexFromX, domeConstrain, laneConstrain, attachPegRoughness } from './layout.mjs';

const dt = 1 / 300;
const qInv = new CANNON.Quaternion();
qInv.setFromEuler(CFG.tiltDeg * Math.PI / 180, 0, 0);
const toLocal = (p) => { const o = new CANNON.Vec3(); qInv.vmult(p, o); return o; };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const N = Number(process.argv[2] ?? 200);
const ROUGH = Number(process.argv[9] ?? 0.4);
const LAT = Number(process.argv[4] ?? 0.12);
if (process.argv[5]) CFG.domeDecel = Number(process.argv[5]);
if (process.argv[8]) CFG.domeExitX = Number(process.argv[8]);
if (process.argv[6] && process.argv[7]) { CFG.launchVMin = Number(process.argv[6]); CFG.launchVMax = Number(process.argv[7]); }
const rng = mulberry32(Number(process.argv[3] ?? 7));
const hist = new Array(CFG.slotCount).fill(0);
let back = 0, stuck = 0, tm = 0;

for (let t = 0; t < N; t++) {
  const { world, matBall } = buildPhysicsWorld(CFG);
  const power = 0.45 + rng() * 0.55;                  // 玩家实际拉杆的力道范围
  const v0 = CFG.launchVMin + (CFG.launchVMax - CFG.launchVMin) * power;
  const ball = createBallAt(world, CFG, matBall, CFG.railX, CFG.railBottomY + CFG.ballR + 0.01, CFG.laneZ ?? CFG.railZ);
  const up = localDir(0, 1, 0);
  const lat = (rng() * 2 - 1) * LAT;                 // 拉杆释放的横向抖动
  const side = localDir(lat, 0, 0);
  ball.velocity.set(up.x * v0 + side.x, up.y * v0 + side.y, up.z * v0 + side.z);
  attachPegRoughness(ball, rng, ROUGH);

  let done = false, slow = 0;
  for (let i = 0; i * dt < 8; i++) {
    world.step(dt);
    laneConstrain(ball, CFG, dt);
    domeConstrain(ball, CFG);
    const l = toLocal(ball.position);
    if (l.y < -0.97 && Math.abs(l.x) < CFG.boardW / 2 - 0.02) {
      hist[slotIndexFromX(l.x, CFG)]++; tm += i * dt; done = true; break;
    }
    if (l.x > CFG.railX - 0.12 && l.y < CFG.railBottomY + 0.5 && ball.velocity.length() < 0.4) {
      slow += dt;
      if (slow > 0.35) { back++; done = true; break; }
    }
  }
  if (!done) stuck++;
}

const total = hist.reduce((a, b) => a + b, 0);
console.log('hist', hist.join(' | '), ' total', total);
console.log('pct ', hist.map((h) => (100 * h / Math.max(1, total)).toFixed(0).padStart(2)).join(' | '));
console.log('rolledBack', back, ' stuck', stuck, ' avgT', (tm / Math.max(1, total)).toFixed(2));
