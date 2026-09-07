import type {Flight,Policy} from './physics.mjs';
export type ReplayFrame={state:Flight;observed:Flight;trace:{inputs:number[];activations:number[][];throttle:number}};
export function flightReplay(model:Policy,base?:Flight):ReplayFrame[];
