import { CFG } from './src/layout.mjs';
import { runSim } from './src/sim.mjs';
const cfgs=[
  {name:'H1 .18 r8 s.19', pegColStep:0.18,pegRowStep:0.19,pegCols:9,pegRows:8},
  {name:'H2 .185 r8 s.185',pegColStep:0.185,pegRowStep:0.185,pegCols:9,pegRows:8},
  {name:'H3 .175 r9 s.175',pegColStep:0.175,pegRowStep:0.175,pegCols:9,pegRows:9},
  {name:'H4 .19 r7 s.20', pegColStep:0.19,pegRowStep:0.20,pegCols:9,pegRows:7},
  {name:'H5 .18 r9 s.175', pegColStep:0.18,pegRowStep:0.175,pegCols:9,pegRows:9},
];
const phys={restitutionBall:0.62,restitutionPeg:0.6,friction:0.02,gravity:15,tiltDeg:16,pegRowStart:0.95};
for(const c of cfgs){
  const cfg={...CFG,...phys,...c};
  const r=runSim(150,99,cfg);
  const pct=r.hist.map(h=>(h/150*100).toFixed(0).padStart(3));
  console.log(`${c.name}: ${pct.join(' ')} avg=${r.avgTime.toFixed(2)}s stuck=${r.stuck} leaks=${r.leaks}`);
}
