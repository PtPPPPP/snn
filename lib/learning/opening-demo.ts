/** Opening demonstration. All samples stay at z=0; camera motion never changes a classifier. */
export type PlanePoint={x:number;y:number;label:0|1;id:string};
export type CaseId='separable'|'xor';
export type Camera={yaw:number;tilt:number};
export type Boundary={a:number;b:number;c:number};
export const FRONT:Camera={yaw:0,tilt:0};
export const OBLIQUE:Camera={yaw:-.3,tilt:.9};
export const DURATION=11200;
export const EASY:readonly PlanePoint[]=[
 {id:'a',x:-.78,y:-.62,label:0},{id:'b',x:-.56,y:-.12,label:0},{id:'c',x:-.72,y:.5,label:0},{id:'d',x:-.28,y:.72,label:0},
 {id:'e',x:.3,y:-.64,label:1},{id:'f',x:.7,y:-.22,label:1},{id:'g',x:.35,y:.25,label:1},{id:'h',x:.75,y:.66,label:1},
];
export const XOR:readonly PlanePoint[]=[{id:'a',x:-.6,y:-.6,label:0},{id:'b',x:.6,y:.6,label:0},{id:'c',x:-.6,y:.6,label:1},{id:'d',x:.6,y:-.6,label:1}];
export function caseData(id:CaseId){return id==='separable'?EASY:XOR;}
export function boundaryFor(id:CaseId):Boundary{return id==='separable'?{a:1,b:0,c:0}:{a:1,b:1,c:.1};}
export function classifierScore(point:{x:number;y:number},line:Boundary){
 const score=line.a*point.x+line.b*point.y+line.c;
 // Finite decimal control values can cancel to floating-point noise at z=0.
 return Math.abs(score)<1e-12?0:score;
}
export function classify(point:{x:number;y:number},line:Boundary){return Number(classifierScore(point,line)>=0);}
export function correctCount(id:CaseId){const line=boundaryFor(id);return caseData(id).filter(p=>classify(p,line)===p.label).length;}
export function cameraProject(x:number,y:number,camera:Camera){
 const u=Math.cos(camera.yaw)*x-Math.sin(camera.yaw)*y;
 const v=Math.sin(camera.yaw)*x+Math.cos(camera.yaw)*y;
 return {x:200+120*u,y:154-120*v*Math.cos(camera.tilt)};
}
export function orbitCamera(camera:Camera,dx:number,dy:number):Camera{return {yaw:Math.max(-.55,Math.min(.55,camera.yaw+dx)),tilt:Math.max(0,Math.min(1.05,camera.tilt+dy))};}
const ease=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export function demoFrame(time:number){
 const t=Math.max(0,Math.min(DURATION,time)),turn=ease((t-1800)/2500);
 const dataset:CaseId=t<6400?'separable':'xor';
 return {time:t,dataset,camera:turn===0?{...FRONT}:{yaw:OBLIQUE.yaw*turn,tilt:OBLIQUE.tilt*turn},
  phase:t<1800?'front':t<4500?'turn':t<6400?'separated':t<9000?'changed':'question',
  pointOpacity:t<6000?1:t<6400?(6400-t)/400:t<6800?(t-6400)/400:1,
  finished:t===DURATION};
}
export function clippedRegion(line:Boundary,positive:boolean):Array<{x:number;y:number}>{
 const square=[{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}],out:Array<{x:number;y:number}>=[];
 if(line.a===0&&line.b===0)return ((line.c>=0)===positive)?square:[];
 const score=(p:{x:number;y:number})=>(line.a*p.x+line.b*p.y+line.c)*(positive?1:-1);
 for(let i=0;i<square.length;i++){const p=square[i],q=square[(i+1)%square.length],a=score(p),b=score(q);if(a>=0)out.push(p);if((a>=0)!==(b>=0)){const t=a/(a-b);out.push({x:p.x+t*(q.x-p.x),y:p.y+t*(q.y-p.y)});}}
 return out;
}
export function boundarySegment(line:Boundary){
 if(line.a===0&&line.b===0)return [];
 const regions=clippedRegion(line,true);return regions.filter(p=>Math.abs(line.a*p.x+line.b*p.y+line.c)<1e-9).filter((p,i,all)=>!all.slice(0,i).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-9));
}
