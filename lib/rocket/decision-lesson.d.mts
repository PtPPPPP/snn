import type {Flight,Policy} from './physics.mjs';
type Trace={inputs:number[];activations:number[][];throttle:number};
export function compareHeight(base:Flight,height:number,model:Policy):{changed:Flight;before:Trace;after:Trace;selected:number[]};
export function nodeCalculation(trace:Trace,model:Policy,layer:number,index:number):{terms:{index:number;input:number;weight:number;product:number}[];bias:number;sum:number;output:number};
