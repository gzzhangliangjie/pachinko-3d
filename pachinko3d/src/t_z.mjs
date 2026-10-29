import * as CANNON from 'cannon-es';
import { CFG, buildPhysicsWorld, createBallAt, localDir } from './layout.mjs';
const dt = 1/300;
const qInv = new CANNON.Quaternion(); qInv.setFromEuler(CFG.tiltDeg*Math.PI/180,0,0);
const toLocal=(p)=>{const o=new CANNON.Vec3();qInv.vmult(p,o);return o;};
// 世界系里看自由落体的局部 z 分量
const { world, matBall } = buildPhysicsWorld(CFG);
const ball = createBallAt(world, CFG, matBall, 0.0, 1.05, 0.055);
for (let i=0;i<60;i++){ world.step(dt); if(i%6===0){const l=toLocal(ball.position); console.log(i, l.x.toFixed(3), l.y.toFixed(3), l.z.toFixed(3));} }
