import * as CANNON from 'cannon-es';
import { CFG, buildPhysicsWorld, createBall, nudge, slotIndexFromX } from './src/layout.mjs';
const TILTf = (t)=>t*Math.PI/180;
function mul32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function trial(cfg, trials=160, entrySpread=0.012){
  const rng=mul32(7); const hist=new Array(10).fill(0); let tsum=0, stuck=0;
  const {world, matBall}=buildPhysicsWorld(cfg);
  const TILT=TILTf(cfg.tiltDeg);
  const lyf=(y,z)=>Math.cos(TILT)*y-Math.sin(TILT)*z;
  for(let t=0;t<trials;t++){
    const x0=cfg.spawnX+(rng()*2-1)*entrySpread;
    const b=createBall(world,cfg,matBall,x0,(rng()*2-1)*0.2,rng);
    let done=false,tm=0; const dt=1/240;
    for(let s=0;s<240*6;s++){
      world.step(dt); tm+=dt;
      if(s%48===0) nudge(b,rng);
      if(lyf(b.position.y,b.position.z)<-0.93){ hist[slotIndexFromX(b.position.x,cfg)]++; done=true; break;}
      if(Math.abs(b.position.x)>cfg.boardW/2+0.1){done=true;break;}
    }
    if(!done) stuck++;
    world.removeBody(b); tsum+=tm;
  }
  return {hist,avg:tsum/trials,stuck,trials};
}

const base={...CFG};
const configs=[
  {name:'A rest.55 fric.03 g12 t18', patch:{restitutionBall:0.55,restitutionPeg:0.55,friction:0.03,gravity:12,tiltDeg:18}},
  {name:'B rest.65 fric.02 g14 t16', patch:{restitutionBall:0.65,restitutionPeg:0.62,friction:0.02,gravity:14,tiltDeg:16}},
  {name:'C rest.45 fric.06 g14 t20', patch:{restitutionBall:0.45,restitutionPeg:0.45,friction:0.06,gravity:14,tiltDeg:20}},
  {name:'D rest.6 fric.02 g12 t22',  patch:{restitutionBall:0.6,restitutionPeg:0.58,friction:0.02,gravity:12,tiltDeg:22}},
  {name:'E rest.7 fric.01 g16 t14',  patch:{restitutionBall:0.7,restitutionPeg:0.65,friction:0.01,gravity:16,tiltDeg:14}},
];
for(const c of configs){
  const t0=Date.now();
  const r=trial({...base,...c.patch});
  const pct=r.hist.map(h=>(h/r.trials*100).toFixed(0).padStart(3));
  console.log(`${c.name}\n  dist ${pct.join(' ')}  avg=${r.avg.toFixed(2)}s stuck=${r.stuck} (${Date.now()-t0}ms)`);
}
