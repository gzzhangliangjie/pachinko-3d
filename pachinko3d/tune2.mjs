import { CFG } from './src/layout.mjs';
import { runSim } from './src/sim.mjs';
const cfgs=[
  {name:'G1 .20/.19 r8 c7', pegColStep:0.20,pegRowStep:0.19,pegRows:8,pegCols:7},
  {name:'G2 .22/.21 r8 c7', pegColStep:0.22,pegRowStep:0.21,pegRows:8,pegCols:7},
  {name:'G3 .24/.20 r9 c6', pegColStep:0.24,pegRowStep:0.20,pegRows:9,pegCols:6},
  {name:'G4 .21/.185 r9 c7', pegColStep:0.21,pegRowStep:0.185,pegRows:9,pegCols:7},
  {name:'G5 .23/.205 r8 c7',pegColStep:0.23,pegRowStep:0.205,pegRows:8,pegCols:7},
];
const phys={restitutionBall:0.62,restitutionPeg:0.6,friction:0.02,gravity:15,tiltDeg:16,pegRowStart:0.95};
for(const c of cfgs){
  const cfg={...CFG,...phys,...c};
  const t0=Date.now();
  const r=runSim(150,99,cfg);
  const pct=r.hist.map(h=>(h/150*100).toFixed(0).padStart(3));
  console.log(`${c.name}: ${pct.join(' ')} avg=${r.avgTime.toFixed(2)}s stuck=${r.stuck} leaks=${r.leaks} (${Date.now()-t0}ms)`);
}
