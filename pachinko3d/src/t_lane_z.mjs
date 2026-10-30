import * as CANNON from 'cannon-es';
import { CFG, buildPhysicsWorld, createBallAt, localDir, laneConstrain, domeConstrain } from './layout.mjs';
const dt = 1 / 300;
const qInv = new CANNON.Quaternion(); qInv.setFromEuler(CFG.tiltDeg * Math.PI / 180, 0, 0);
const toLocal = (p) => { const o = new CANNON.Vec3(); qInv.vmult(p, o); return o; };

const { world, matBall } = buildPhysicsWorld(CFG);
// 从滑道底部发射（速度取中档）
const v = localDir(0, (CFG.launchVMin + CFG.launchVMax) / 2, 0, CFG);
const ball = createBallAt(world, CFG, matBall, CFG.railX, CFG.railBottomY, CFG.laneZ);
ball.velocity.set(v.x, v.y, v.z);

let inLane = true;
const zs = [];
for (let i = 0; i < 3000; i++) {
  laneConstrain(ball, CFG, dt);
  domeConstrain(ball, CFG, dt);
  world.step(dt);
  const l = toLocal(ball.position);
  if (inLane && Math.abs(l.x - CFG.railX) <= CFG.railChHalf + 0.02 && l.y <= CFG.railTopY) zs.push(l.z);
  if (l.y > CFG.railTopY + 0.05) { inLane = false; }
}
const zmin = Math.min(...zs), zmax = Math.max(...zs);
console.log('滑道段采样点数', zs.length);
console.log('局部 z 最小/最大 =', zmin.toFixed(4), zmax.toFixed(4), ' 跨度 =', (zmax - zmin).toFixed(4));
console.log('应为恒定', CFG.laneZ, '（跨度接近 0 即不斜插）');
console.log('几个采样:', zs.filter((_, i) => i % Math.ceil(zs.length / 8) === 0).map(z => z.toFixed(4)).join(' -> '));
