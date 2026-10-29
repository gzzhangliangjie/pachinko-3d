import { CFG, buildPhysicsWorld, createBall, nudge } from './src/layout.mjs';
const TILT=CFG.tiltDeg*Math.PI/180;
const ly=(y,z)=>Math.cos(TILT)*y-Math.sin(TILT)*z;
const { world, matBall } = buildPhysicsWorld(CFG);
const b = createBall(world, CFG, matBall, CFG.spawnX, 0.1);
let hits=0; b.addEventListener('collide',()=>hits++);
for (let i=0;i<240*5;i++){ world.step(1/240); if(i%48===0) nudge(b);
  if(i%60===0) console.log(`t=${(i/240).toFixed(2)} ly=${ly(b.position.y,b.position.z).toFixed(3)} x=${b.position.x.toFixed(3)} hits=${hits} |v|=${b.velocity.length().toFixed(2)}`);
  if (ly(b.position.y,b.position.z) < -0.93) { console.log('LAND t=',(i/240).toFixed(2),'x=',b.position.x.toFixed(3),'hits',hits); break; }
}
