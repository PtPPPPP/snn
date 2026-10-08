import {classifierScore,boundarySegment,type Boundary} from './opening-demo.ts';
/** Fixed display scale: input axes [-1,1], score axis [-6,6]. Never fit to current weights. */
export const SCORE_SCALE=.28;
export const SCORE_HALF_WIDTH=2.95;
export function scorePosition(x:number,y:number,line:Boundary):[number,number,number]{return [x,y,classifierScore({x,y},line)*SCORE_SCALE];}
export function scoreProject(x:number,y:number,z:number){
 const right=.8*x+.6*y,up=(-9*x+12*y+25*z*SCORE_SCALE)/(5*Math.sqrt(34)),scale=400/(2*SCORE_HALF_WIDTH);
 return {x:200+scale*right,y:154-scale*up};
}
export function scorePlaneRelation(line:Boundary){
 if(line.a===0&&line.b===0)return line.c===0?'coincident':line.c>0?'above':'below';
 const count=boundarySegment(line).length;return count>=2?'crossing':count===1?'tangent':'outside';
}
export function scorePlaneTriangles(line:Boundary){
 return [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]].flatMap(([x,y])=>scorePosition(x,y,line));
}
