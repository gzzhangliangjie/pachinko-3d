import { CFG, buildPhysicsWorld, createBallAt, localDir } from './src/layout.mjs';
const TILT = CFG.tiltDeg * Math.PI / 180;
const ly = (y, z) => Math.cos(TILT) * y - Math.sin(TILT) * z;
function trial(v0, verbose) {
  const { world, matBall } = buildPhysicsWorld(CFG);
  const b = createBallAt(world, CFG, matBall, CFG.railX, CFG.railBottomY + 0.02, CFG.railZ, 0, 0, 0);
  const v = localDir(0, v0, 0);
  b.velocity.set(v.x, v.y, v.z);
  const dt = 1 / 300;
  let maxY = -99, escaped = false;
  for (let s = 0; s < 300 * 6; s++) {
    world.step(dt);
    const lly = ly(b.position.y, b.position.z);
    if (lly > maxY) maxY = lly;
    if (Math.abs(b.position.y) > 50) { escaped = true; break; }
    if (s % 15 === 0 && verbose) console.log(`t=${(s*dt).toFixed(2)} x=${b.position.x.toFixed(3)} ly=${lly.toFixed(3)} vz=${b.position.z.toFixed(3)} |v|=${b.velocity.length().toFixed(2)}`);
    if (verbose && s > 120) break;
  }
  return { maxY, escaped };
}
trial(10.8, true);
console.log('---');
for (const v0 of [9.2, 9.6, 10.0, 10.4, 10.8, 11.2, 11.6, 12.0]) {
  const r = trial(v0, false);
  console.log(`v0=${v0}: maxY=${r.maxY.toFixed(2)} escaped=${r.escaped}`);
}
