import fs from 'node:fs';
import {initialState,policyTrace,step} from '../lib/rocket/physics.mjs';
const model=JSON.parse(fs.readFileSync('public/rocket/energy.json'));
const weights=model.layers.at(-1).weight[0],totals=weights.map(()=>0),peaks=weights.map(()=>0);
let s=initialState(50),ticks=0,u=0,count=0;
while(!s.result&&ticks<10000){
 if(ticks%5===0){
  const t=policyTrace(s,model);u=t.throttle;count++;
  weights.forEach((w,i)=>{const c=Math.abs(w*t.activations[1][i]);totals[i]+=c;peaks[i]=Math.max(peaks[i],c);});
 }
 s=step(s,u);ticks++;
}
const rows=weights.map((weight,index)=>({index,weight,meanAbsContribution:totals[index]/count,peakAbsContribution:peaks[index]}));
const data={checkpoint:model.checkpoint,sha256:model.sha256,description:'Single deterministic 50m flight, 5kg fuel, 10ms physics, 50ms decisions. Contributions to raw action before clipping; not causal importance or general evaluation.',samples:count,result:s.result,topWeights:[...rows].sort((a,b)=>Math.abs(b.weight)-Math.abs(a.weight)).slice(0,8),topContributions:[...rows].sort((a,b)=>b.meanAbsContribution-a.meanAbsContribution).slice(0,8)};
fs.writeFileSync('public/rocket/energy-importance.json',JSON.stringify(data,null,2));
console.log(JSON.stringify(data));
