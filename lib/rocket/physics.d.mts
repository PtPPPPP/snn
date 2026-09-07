export type Flight = {h:number;v:number;fuel:number;thrust:number;t:number;result:string|null};
export type Policy = {energy:boolean;mean:number[];variance:number[];epsilon:number;clip:number;layers:{weight:number[][];bias:number[]}[]};
export const DT:number;
export function initialState(height?:number):Flight;
export function step(s:Flight,throttle:number,dt?:number):Flight;
export function throttleForHold(seconds:number,held:boolean):number;
export function policyThrottle(s:Flight,model:Policy):number;
export function observation(s:Flight,energy:boolean):number[];

export function policyTrace(s:Flight,model:Policy):{inputs:number[];activations:number[][];throttle:number};
