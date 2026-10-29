import * as CANNON from 'cannon-es';
import { CFG, buildPhysicsWorld, createBallAt, localDir, slotIndexFromX, domeConstrain } from './layout.mjs';
const dt=1/300;
const qInv=new CANNON.Quaternion(); qInv.setFromEuler(CFG.tiltDeg*Math.PI/180,0,0);
const toLocal=(p)=>{const o=new CANNON.Vec3();qInv.vmult(p,o);return o;};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng=mulberry32(99);
for(let k=0;k<24;k++){
  const {world,matBall}=buildPhysicsWorld(CFG);
  const pw=0.45+rng()*0.55, v0=CFG.launchVMin+(CFG.launchVMax-CFG.launchVMin)*pw;
  const b=createBallAt(world,CFG,matBall,CFG.railX,CFG.railBottomY+CFG.ballR+0.01,CFG.railZ);
  const up=localDir(0,1,0); b.velocity.set(up.x*v0,up.y*v0,up.z*v0);
  let exitX=null, entryX=null, out=null;
  for(let i=0;i*dt<8;i++){
    world.step(dt); domeConstrain(b,CFG,dt);
    const l=toLocal(b.position);
    if(exitX===null && l.x<CFG.domeExitX) exitX=+l.x.toFixed(2);
    if(entryX===null && l.y<0.60) entryX=+l.x.toFixed(2);
    if(l.y<-0.97&&Math.abs(l.x)<CFG.boardW/2-0.02){out={slot:slotIndexFromX(l.x,CFG),x:+l.x.toFixed(2)};break;}
  }
  console.log(`pw=${pw.toFixed(2)} v0=${v0.toFixed(1)} exit=${exitX} entry0.6=${entryX} -> ${JSON.stringify(out)}`);
}
