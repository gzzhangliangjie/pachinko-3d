const MULT=[2,4,6,8,10], W=[0.63,0.235,0.08,0.04,0.015];
const s=W.reduce((a,b)=>a+b,0), p=W.map(w=>w/s);
console.log('sum',s,'p',p,'mean',p.reduce((a,b,i)=>a+b*MULT[i],0));
let tot=0, exp=0;
for(let a=0;a<5;a++)for(let b=0;b<5;b++){if(b===a)continue;for(let c=0;c<5;c++){if(c===a||c===b)continue;
 const pr=p[a]*(p[b]/(1-p[a]))*(p[c]/(1-p[a]-p[b])); tot+=pr; exp+=pr*(MULT[a]+MULT[b]+MULT[c])/3;}}
console.log('tot',tot,'exp',exp);
