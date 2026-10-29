import { CFG, buildPhysicsWorld, createBallAt, nudge, slotIndexFromX, localDir } from './src/layout.mjs';
const TILT = CFG.tiltDeg * Math.PI / 180;
const ly = (y, z) => Math.cos(TILT) * y - Math.sin(TILT) * z;

function trial(v0, seedRng) {
  const { world, matBall } = buildPhysicsWorld(CFG);
  const b = createBallAt(world, CFG, matBall, CFG.railX, CFG.railBottomY + 0.02, CFG.railZ, 0, 0, 0);
  const v = localDir(0, v0, 0);
  b.velocity.set(v.x, v.y, v.z);
  let entered = false, out = null;
  const dt = 1 / 300;
  let trace = [];
  for (let s = 0; s < 300 * 12; s++) {
    world.step(dt);
    if (s % 60 === 0) {
      const lly = ly(b.position.y, b.position.z);
      trace.push(`t${(s*dt).toFixed(1)}: x=${b.position.x.toFixed(2)} ly=${lly.toFixed(2)} |v|=${b.velocity.length().toFixed(1)}`);
    }
    // 粗略局部 x（旋转只绕 X，x 不变）
    const lly = ly(b.position.y, b.position.z);
    if (lly > 0.9) entered = true;
    if (entered && lly < -0.97 && Math.abs(b.position.x) < CFG.boardW / 2 - 0.02) {
      out = { slot: slotIndexFromX(b.position.x), t: s * dt, x: b.position.x };
      break;
    }
    if (entered && b.position.x > CFG.boardW / 2 && lly < CFG.railBottomY + 0.12 && b.velocity.length() < 0.4) {
      out = { slot: 'REARM', t: s * dt, x: b.position.x };
      break;
    }
    if (s % 120 === 0) nudge(b, seedRng);
  }
  return { out, trace, finalX: b.position.x, finalLY: ly(b.position.y, b.position.z), finalV: b.velocity.length() };
}

for (const v0 of [9.1, 9.6, 10.2, 10.8, 11.4]) {
  const r = trial(v0, Math.random);
  console.log(`v0=${v0} -> ${JSON.stringify(r.out)} | final x=${r.finalX.toFixed(2)} ly=${r.finalLY.toFixed(2)} v=${r.finalV.toFixed(2)}`);
  if (!r.out) console.log('   ' + r.trace.slice(-8).join(' | '));
}
