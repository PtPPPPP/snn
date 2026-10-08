export type Observation = { attempt: number; model: string; sample: string; prediction: number | null; goal: boolean };
export type LocalFeedback = { observation: Observation; completed: boolean; event: number; active: boolean; kind: 'complete' | 'flip' | null; from: number | null };
export function initialFeedback(observation: Observation): LocalFeedback {
  // An initially solved preset is factual, but never earns a completion event.
  return { observation, completed: observation.goal, event: 0, active: false, kind: null, from: null };
}
export function sameObservation(a: Observation,b: Observation) {
  return a.attempt===b.attempt&&a.model===b.model&&a.sample===b.sample&&a.prediction===b.prediction&&a.goal===b.goal;
}
export function observeFeedback(state: LocalFeedback, next: Observation): LocalFeedback {
  if(next.attempt!==state.observation.attempt)return initialFeedback(next);
  const old=state.observation,changed=old.model!==next.model;
  const result={...state,observation:next};
  if(!next.goal&&state.kind==='complete') { result.active=false;result.kind=null; }
  if(old.sample!==next.sample&&state.kind==='flip') { result.active=false;result.kind=null; }
  if(changed&&!old.goal&&next.goal&&!state.completed) {
    return {...result,completed:true,event:state.event+1,active:true,kind:'complete',from:null};
  }
  if(changed&&old.sample===next.sample&&old.prediction!==null&&next.prediction!==null&&old.prediction!==next.prediction) {
    return {...result,event:state.event+1,active:true,kind:'flip',from:old.prediction};
  }
  return result;
}
export function expireFeedback(state: LocalFeedback,event: number,attempt: number): LocalFeedback {
  return state.event===event&&state.observation.attempt===attempt?{...state,active:false}:state;
}
