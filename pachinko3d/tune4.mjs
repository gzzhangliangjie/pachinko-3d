import { CFG } from './src/layout.mjs';
import { runSim, expectationOfThree } from './src/sim.mjs';
const cfg={...CFG, pegColStep:0.19, pegRowStep:0.20, pegCols:9, pegRows:8, pegRowStart:1.00,
           restitutionBall:0.62, restitutionPeg:0.6, friction:0.02, gravity:16, tiltDeg:16};
const r=runSim(400, 2024, cfg);
console.log(r.hist.map(h=>(h/400*100).toFixed(1).padStart(5)).join(' '));
console.log('avg',r.avgTime.toFixed(2),'stuck',r.stuck,'leaks',r.leaks,'landed',r.landed);
const em=expectationOfThree();
console.log('E[M]',em.toFixed(4),'RTP',(0.3*em*100).toFixed(2)+'%');
