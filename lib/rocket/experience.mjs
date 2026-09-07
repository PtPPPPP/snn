import {initialState} from './physics.mjs';
export const resetRound = height => ({human:initialState(height),ai:initialState(height),throttle:0,aiThrottle:0,steps:0,phase:'ready',humanBurn:null,aiBurn:null});
export const cameraTarget=(human,ai,start)=>{const high=Math.max(human,ai);return Math.max(high*1.2+5,high>=20?start*1.2+5:12+(start*1.2-7)*Math.max(0,high-3)/17);};
export const firstBurn=(previous,thrust,height)=>previous===null&&thrust>=15?height:previous;
