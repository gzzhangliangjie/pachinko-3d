// 全物理轨道验证：从轨道底部按不同初速竖直弹射，看球能否爬过弯道落进盘面，
// 或滚回底部。用法: node src/t_track.mjs
import * as CANNON from 'cannon-es';
import { CFG, buildPhysicsWorld, createBallAt, localDir, slotIndexFromX, domeConstrain } from './layout.mjs';

const dt = 1 / 300;
const T_MAX = 16;
const qInv = new CANNON.Quaternion();
qInv.setFromEuler(CFG.tiltDeg * Math.PI / 180, 0, 0);   // tiltQuat 的逆

function toLocal(p) {
  const out = new CANNON.Vec3();
  qInv.vmult(p, out);
  return out;
}

function shot(power, verbose = false) {
  const { world, matBall } = buildPhysicsWorld(CFG);
  const v0 = CFG.launchVMin + (CFG.launchVMax - CFG.launchVMin) * power;
  const ball = createBallAt(world, CFG, matBall,
    CFG.railX, CFG.railBottomY + CFG.ballR + 0.01, CFG.railZ, 0, 0, 0);
  const up = localDir(0, 1, 0);
  ball.velocity.set(up.x * v0, up.y * v0, up.z * v0);

  let maxLy = -9, slowT = 0, t = 0;
  for (let i = 0; i * dt < T_MAX; i++) {
    world.step(dt);
    domeConstrain(ball, CFG);
    t = i * dt;
    const l = toLocal(ball.position);
    const sp = ball.velocity.length();
    if (l.y > maxLy) maxLy = l.y;
    if (verbose && i % 30 === 0) {
      console.log(`   t=${t.toFixed(2)} lx=${l.x.toFixed(3)} ly=${l.y.toFixed(3)} |v|=${sp.toFixed(2)}`);
    }
    if (t > 0.4 && l.y < -0.97 && Math.abs(l.x) < CFG.boardW / 2 - 0.02) {
      return { landed: slotIndexFromX(l.x), lx: +l.x.toFixed(2), t: +t.toFixed(2), maxLy: +maxLy.toFixed(2) };
    }
    if (t > 0.4 && l.x > CFG.railX - 0.12 && l.y < CFG.railBottomY + 0.5 && sp < 0.45) {
      slowT += dt;
      if (slowT > 0.4) return { rolledBack: true, t: +t.toFixed(2), maxLy: +maxLy.toFixed(2) };
    } else slowT = 0;
  }
  const l = toLocal(ball.position);
  return { timeout: true, lx: +l.x.toFixed(2), ly: +l.y.toFixed(2), maxLy: +maxLy.toFixed(2) };
}

console.log('power | v0   | result');
for (const pw of [0, 0.15, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
  const v0 = CFG.launchVMin + (CFG.launchVMax - CFG.launchVMin) * pw;
  console.log(`${pw.toFixed(2)}  | ${v0.toFixed(1)} | ${JSON.stringify(shot(pw))}`);
}
