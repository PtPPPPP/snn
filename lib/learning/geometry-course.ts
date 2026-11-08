export type Point=[number,number];
export type Plane=[number,number,number];
export type CourseModel={linear:Plane;hinge:Plane;gain:number;activation:'linear'|'relu'};
export type CourseState={kind:'geometry-course';coordinates:'centered';input:Point;model:CourseModel;dataset:'centered'|'shifted'|'xor'};
export type Sample={point:Point;label:0|1};
export type Activity='line'|'sides'|'score'|'plane'|'relu'|'probability'|'loss';
export const parameterNames=['v₁','v₂','b₀','w₁','w₂','bₕ','v₃'];
export const grid=Array.from({length:81},(_,i)=>[i%9/8,Math.floor(i/9)/8] as Point);
export const splitSamples:Sample[]=[{point:[.125,.125],label:0},{point:[.125,.375],label:0},{point:[.25,.25],label:0},{point:[.375,.125],label:0},{point:[.625,.75],label:1},{point:[.75,.625],label:1},{point:[.875,.875],label:1},{point:[.875,.625],label:1}];
export const shiftedSamples:Sample[]=[{point:[.625,.375],label:0},{point:[.625,.5],label:0},{point:[.625,.625],label:0},{point:[.875,.125],label:1},{point:[.875,.5],label:1},{point:[.875,.875],label:1}];
export const xorSamples:Sample[]=[{point:[.125,.125],label:0},{point:[.125,.875],label:1},{point:[.875,.125],label:1},{point:[.875,.875],label:0}];
export const trainingSamples:Sample[]=xorSamples.flatMap(({point,label})=>[-.04,0,.04].flatMap(dx=>[-.04,0,.04].map(dy=>({point:[point[0]+dx,point[1]+dy] as Point,label}))));
export const clone=<T,>(value:T):T=>structuredClone(value);
export const fmt=(n:number)=>Math.abs(n)<.00005?'0':Number(n.toFixed(4)).toString();
export const snap=(n:number)=>Math.round(Math.max(0,Math.min(1,n))*8)/8;
export const coordinate=(n:number)=>2*n-1;
export const shownPoint=(p:Point)=>p.map(coordinate).map(fmt).join(', ');
// Points use [0,1] for drawing and hit testing. Mathematical input axes are [-1,1].
export const planeValue=(p:Plane,x:Point)=>p[0]*coordinate(x[0])+p[1]*coordinate(x[1])+p[2];
export function trace(model:CourseModel,x:Point){const a=planeValue(model.hinge,x),h=model.activation==='linear'?a:Math.max(0,a),base=planeValue(model.linear,x),s=base+model.gain*h,p1=s>=0?1/(1+Math.exp(-s)):Math.exp(s)/(1+Math.exp(s));return {a,h,base,s,p1,p0:1-p1,label:(s>=0?1:0) as 0|1};}
export function loss(s:number,y:number){return Math.max(s,0)-s*y+Math.log1p(Math.exp(-Math.abs(s)));}
export function evaluate(model:CourseModel,data:Sample[]){let total=0,correct=0;for(const item of data){const t=trace(model,item.point);total+=loss(t.s,item.label);correct+=Number(t.label===item.label);}return {loss:total/data.length,correct,total:data.length};}
export function gradient(model:CourseModel,data:Sample[]){const result=Array(7).fill(0) as number[];for(const {point,label} of data){const t=trace(model,point),d=t.p1-label,q=d*model.gain*(model.activation==='linear'||t.a>0?1:0),x=coordinate(point[0]),y=coordinate(point[1]),values=[d*x,d*y,d,q*x,q*y,q,d*t.h];values.forEach((v,i)=>result[i]+=v/data.length);}return result.map((v,i)=>model.activation==='linear'&&i>2?0:v);}
export const parameters=(m:CourseModel)=>[...m.linear,...m.hinge,m.gain];
export const fromParameters=(v:number[],activation:CourseModel['activation']='relu'):CourseModel=>({linear:[v[0],v[1],v[2]],hinge:[v[3],v[4],v[5]],gain:v[6],activation});
export const update=(m:CourseModel,g:number[],rate:number)=>fromParameters(parameters(m).map((v,i)=>v-rate*g[i]),m.activation);
export const samplesFor=(state:CourseState)=>state.dataset==='xor'?xorSamples:state.dataset==='shifted'?shiftedSamples:splitSamples;
export const learningSamples=(state:CourseState)=>samplesFor(state);
export function initialCourse():CourseState{return {kind:'geometry-course',coordinates:'centered',input:[.75,.625],model:{linear:[1,-1,0],hinge:[1,1,0],gain:0,activation:'linear'},dataset:'centered'};}
export function readCourse(value:unknown):CourseState|null{
 if(!value||typeof value!=='object')return null;const record=value as CourseState;
 if(record.kind!=='geometry-course'||record.coordinates!=='centered'||!Array.isArray(record.input)||!record.model||!Array.isArray(record.model.linear)||!Array.isArray(record.model.hinge))return null;
 if(record.input.length!==2||!record.input.every(Number.isFinite)||parameters(record.model).length!==7||!parameters(record.model).every(Number.isFinite))return null;
 return clone(record);
}
/** Each activity has its own teaching setup, regardless of earlier interactions. */
export function startActivity(kind:Activity):CourseState{
 const next=initialCourse();
 if(['sides','score','plane'].includes(kind))next.model.linear=[1,0,0];
 if(kind==='relu'){next.dataset='xor';next.input=[.25,.25];next.model.activation='relu';}
 if(kind==='probability'||kind==='loss'){next.dataset='shifted';next.model.linear=[1,0,-.5];}
 if(kind==='loss')next.input=[...shiftedSamples[0].point];
 return next;
}
