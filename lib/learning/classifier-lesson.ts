import {classifierScore,type Boundary,type PlanePoint} from './opening-demo.ts';
/** One snapshot feeds the unit, substituted equation, class and field. */
export function evaluateClassifier(point:Pick<PlanePoint,'x'|'y'>,line:Boundary){
 const first=line.a*point.x,second=line.b*point.y,score=classifierScore(point,line);
 return {first,second,score,predicted:(score>=0?1:0) as 0|1};
}
export function collapseAffine(hidden:[[number,number],[number,number]],bias:[number,number],output:[number,number],offset:number):Boundary{
 return {a:output[0]*hidden[0][0]+output[1]*hidden[1][0],b:output[0]*hidden[0][1]+output[1]*hidden[1][1],c:output[0]*bias[0]+output[1]*bias[1]+offset};
}

export function formatClassifierNumber(n:number){return Math.abs(n)<1e-12?'0':Number(n.toFixed(4)).toString();}
