import fs from 'node:fs';
import {initialState,policyTrace,step} from '../lib/rocket/physics.mjs';
const m=JSON.parse(fs.readFileSync('public/rocket/energy.json'));
function collect(heights){const rows=[[],[]];for(const h of heights){let s=initialState(h),tick=0,u=0;while(!s.result&&tick<10000){if(tick%5===0){const t=policyTrace(s,m);u=t.throttle;t.activations.slice(0,2).forEach((a,i)=>rows[i].push(a));}s=step(s,u);tick++;}}return rows;}
function correlations(rows){return rows.map((r,layer)=>{const n=r.length,mean=Array.from({length:128},(_,i)=>r.reduce((s,x)=>s+x[i],0)/n),ss=mean.map((mu,i)=>r.reduce((s,x)=>s+(x[i]-mu)**2,0));let pairs=[];for(let i=0;i<128;i++)for(let j=i+1;j<128;j++){if(ss[i]<1e-16||ss[j]<1e-16)continue;const corr=r.reduce((s,x)=>s+(x[i]-mean[i])*(x[j]-mean[j]),0)/Math.sqrt(ss[i]*ss[j]);const exact=r.every(x=>x[i]===x[j]);pairs.push({i:i+1,j:j+1,r:corr,exact});}pairs.sort((a,b)=>b.r-a.r);return {layer:layer+1,samples:n,nearPerfect:pairs.filter(p=>p.r>1-1e-12).length,above999:pairs.filter(p=>p.r>.999).length,top:pairs.slice(0,6)};});}
console.log(JSON.stringify({single:correlations(collect([50])),varied:correlations(collect([30,45,50,55,80]))},null,2));
