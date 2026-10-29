import { theoreticalRtp, expectedMult, drawRound, LIT_TABLE, MULT_VALUES } from './src/rules.mjs';
console.log('theoretical RTP =', (theoreticalRtp()*100).toFixed(2)+'%');
console.log('E[M] overall =', expectedMult().toFixed(3));
// 蒙特卡洛验证
let bet=0, win=0; const rng=Math.random;
for(let i=0;i<200000;i++){
  const r=drawRound(rng); bet+=1;
  if(r.slots.includes(Math.floor(rng()*8))) win+=r.mult;
}
console.log('MC RTP =', (win/bet*100).toFixed(2)+'%');
for(const t of LIT_TABLE){
  const ws=t.w.reduce((a,b)=>a+b,0);
  console.log(`N=${t.n} p=${t.p} E=${t.w.reduce((s,w,i)=>s+w/ws*MULT_VALUES[i],0).toFixed(2)} `+
    t.w.map((w,i)=>w>0?`${MULT_VALUES[i]}x:${(w/ws*100).toFixed(0)}%`:'').filter(Boolean).join(' '));
}
