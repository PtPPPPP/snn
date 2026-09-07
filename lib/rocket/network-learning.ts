import {initialState,step,type Flight} from './physics.mjs';
export const actions=[0,.5,1];
export function initialNetwork(){return Array.from({length:36},(_,i)=>Math.sin(i*7.31+2)*.35);}
export function forward(w:number[],x:number[]){
 const hidden=Array.from({length:4},(_,j)=>Math.tanh(w[j*4+3]+x.reduce((s,v,i)=>s+v*w[j*4+i],0)));
 const outputs=Array.from({length:4},(_,j)=>w[16+j*5+4]+hidden.reduce((s,v,i)=>s+v*w[16+j*5+i],0));
 const exp=outputs.slice(0,3).map(v=>Math.exp(v-Math.max(...outputs.slice(0,3))));const total=exp.reduce((s,v)=>s+v,0);
 return {hidden,outputs,prob:exp.map(v=>v/total),value:outputs[3]};
}
export type Sample={state:Flight;next:Flight;x:number[];action:number;reward:number;ret:number;advantage:number;episode:number};
export function collect(w:number[],seed:number){
 const samples:Sample[]=[];let s=seed>>>0;
 const random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 for(let episode=0;episode<4;episode++){
  let state=initialState(50);const trajectory:Sample[]=[];
  for(let k=0;k<200&&!state.result;k++){
   const x=[state.h/50,state.v/20,state.fuel/5],f=forward(w,x),r=random();const action=r<f.prob[0]?0:r<f.prob[0]+f.prob[1]?1:2;
   let next=state;for(let j=0;j<10&&!next.result;j++)next=step(next,actions[action]);
   if(k===199&&!next.result)next={...next,result:'timeout'};
   const reward=-(state.fuel-next.fuel)*.1-(next.t-state.t)*.02+(next.result?(next.result==='success'?1:-1):0);
   trajectory.push({state,next,x,action,reward,ret:0,advantage:0,episode});state=next;
  }
  let ret=0;for(let i=trajectory.length-1;i>=0;i--){ret=trajectory[i].reward+.99*ret;trajectory[i].ret=ret;trajectory[i].advantage=ret-forward(w,trajectory[i].x).value;}
  samples.push(...trajectory);
 }
 return samples;
}
// Advantages are frozen from the collecting network; gradients do not pass through them or physics.
export function lossGradient(w:number[],samples:Sample[]){
 const gradient=w.map(()=>0);let loss=0;
 for(const s of samples){
  const f=forward(w,s.x);loss+=-s.advantage*Math.log(Math.max(1e-12,f.prob[s.action]))+.5*(f.value-s.ret)**2;
  const delta=[...f.prob.map((p,k)=>s.advantage*(p-(k===s.action?1:0))),f.value-s.ret];
  const dh=[0,0,0,0];
  delta.forEach((d,k)=>{for(let j=0;j<4;j++){gradient[16+k*5+j]+=d*f.hidden[j];dh[j]+=d*w[16+k*5+j];}gradient[16+k*5+4]+=d;});
  dh.forEach((d,j)=>{const dz=d*(1-f.hidden[j]**2);for(let i=0;i<3;i++)gradient[j*4+i]+=dz*s.x[i];gradient[j*4+3]+=dz;});
 }
 return {loss:loss/samples.length,gradient:gradient.map(g=>g/samples.length)};
}
export function learnBatch(w:number[],seed:number){const before=[...w],samples=collect(before,seed),g=lossGradient(before,samples);return {before,after:before.map((v,i)=>v-.03*g.gradient[i]),samples,...g};}
