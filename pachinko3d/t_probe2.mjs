import { CFG, buildPhysicsWorld, createBall } from './src/layout.mjs';
const TILT=CFG.tiltDeg*Math.PI/180;
const ly=(y,z)=>Math.cos(TILT)*y-Math.sin(TILT)*z;
const { world, matBall } = buildPhysicsWorld(CFG);
const b = createBall(world, CFG, matBall, 0.0, 0.0);
const t0=Date.now(); let steps=0;
for (let i=0;i<240*6;i++){ world.step(1/240); steps++;
  if(i%120===0) console.log(`t=${(i/240).toFixed(1)} ly=${ly(b.position.y,b.position.z).toFixed(3)} x=${b.position.x.toFixed(3)} vy=${b.velocity.y.toFixed(2)} |v|=${b.velocity.length().toFixed(2)}`);
  if (ly(b.position.y,b.position.z) < -0.93) { console.log('landed at t=',(i/240).toFixed(2),'x=',b.position.x.toFixed(3)); break; }
}
console.log('ms', Date.now()-t0, 'steps', steps);
