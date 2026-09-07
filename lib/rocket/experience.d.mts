import type {Flight} from './physics.mjs';
export type Round={human:Flight;ai:Flight;throttle:number;aiThrottle:number;steps:number;phase:'ready'|'running'|'paused'|'done';humanBurn:number|null;aiBurn:number|null};
export function resetRound(height:number):Round;
export function cameraTarget(human:number,ai:number,start:number):number;
export function firstBurn(previous:number|null,thrust:number,height:number):number|null;
