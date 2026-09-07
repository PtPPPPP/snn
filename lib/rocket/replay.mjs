import {initialState,policyTrace,step} from './physics.mjs';
export function flightReplay(model,base=initialState(50)){
 const frames=[];
 let state={...base,t:0,result:null};
 for(let ticks=0;ticks<10001&&!state.result;){
  const observed=state,trace=policyTrace(observed,model);
  frames.push({state:observed,observed,trace});
  for(let j=0;j<5&&!state.result;j++,ticks++)state=step(state,trace.throttle);
 }
 const last=frames.at(-1);
 if(last&&state.result)frames.push({state,observed:last.observed,trace:last.trace});
 return frames;
}
