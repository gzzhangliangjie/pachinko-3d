// 逐帧追迹：看球在顶部圆弧处的速度变化
import * as CANNON from 'cannon-es';
import { CFG, buildPhysicsWorld, createBallAt, localDir, domeConstrain } from './layout.mjs';

const dt = 1 / 300;
const qInv = new CANNON.Quaternion();
qInv.setFromEuler(CFG.tiltDeg * Math.PI / 180, 0, 0);
const toLocal = (p) => { const o = new CANNON.Vec3(); qInv.vmult(p, o); return o; };

const power = Number(process.argv[2] ?? 1);
const { world, matBall } = buildPhysicsWorld(CFG);
const v0 = CFG.launchVMin + (CFG.launchVMax - CFG.launchVMin) * power;
const ball = createBallAt(world, CFG, matBall, CFG.railX, CFG.railBottomY + CFG.ballR + 0.01, CFG.laneZ ?? CFG.railZ);
const up = localDir(0, 1, 0);
ball.velocity.set(up.x * v0, up.y * v0, up.z * v0);

const from = Number(process.argv[3] ?? 0);
const to = Number(process.argv[4] ?? 200);
for (let i = 0; i * dt < 6; i++) {
  world.step(dt);
  domeConstrain(ball, CFG, dt);
  const l = toLocal(ball.position);
  const vl = toLocal(ball.velocity);
  if (i >= from && i <= to) {
    console.log(`${String(i).padStart(3)} x=${l.x.toFixed(3)} y=${l.y.toFixed(3)} z=${l.z.toFixed(3)} d=${Math.hypot(l.x - CFG.domeCx, l.y - CFG.domeCy).toFixed(3)} v=(${vl.x.toFixed(2)},${vl.y.toFixed(2)},${vl.z.toFixed(2)}) |v|=${vl.length().toFixed(2)}`);
  }
}

// 联系人诊断：重跑一次，打印 57/58 帧的接触
{
  const w2 = buildPhysicsWorld(CFG);
  const b2 = createBallAt(w2.world, CFG, w2.matBall, CFG.railX, CFG.railBottomY + CFG.ballR + 0.01, CFG.laneZ ?? CFG.railZ);
  const u2 = localDir(0, 1, 0);
  b2.velocity.set(u2.x * v0, u2.y * v0, u2.z * v0);
  for (let i = 0; i * dt < 6; i++) {
    w2.world.step(dt);
    domeConstrain(b2, CFG);
    if (i === 58) {
      const l = toLocal(b2.position);
      console.log('--- contacts at step 58, ball at', l.x.toFixed(3), l.y.toFixed(3), l.z.toFixed(3));
      for (const c of w2.world.contacts) {
        if (c.bi === b2 || c.bj === b2) {
          const other = c.bi === b2 ? c.bj : c.bi;
          const s = other.shapes[0];
          const ol = toLocal(other.position);
          console.log('  other', other.shapes.length, s.constructor.name, 'pos', ol.x.toFixed(3), ol.y.toFixed(3), ol.z.toFixed(3),
            s.halfExtents ? `he=${s.halfExtents.x.toFixed(3)},${s.halfExtents.y.toFixed(3)},${s.halfExtents.z.toFixed(3)}` : `r=${s.radius}`);
        }
      }
    }
  }
}
