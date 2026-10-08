export type SpaceStage=0|1|2;
export const CORNERS=[{id:'00',x:0,y:0,label:0},{id:'10',x:1,y:0,label:1},{id:'01',x:0,y:1,label:1},{id:'11',x:1,y:1,label:0}] as const;
export function featureCoordinates(x:number,y:number,stage:SpaceStage):[number,number,number]{return [x,y,stage===0?0:stage===1?x+y-1:Math.max(0,x+y-1)];}
export function featureSample(x:number,y:number,stage:SpaceStage){const a:[number,number,number]=[x,y,x+y-1],h=featureCoordinates(x,y,stage),score=h[0]+h[1]-2*h[2]-.5;return {a,h,score,predicted:(score>=0?1:0) as 0|1};}
export function featureCount(stage:SpaceStage){return CORNERS.filter(p=>featureSample(p.x,p.y,stage).predicted===p.label).length;}
export const FEATURE_HALF_WIDTH=1.85;
export function featureProject(x:number,y:number,z:number){const u=x-.5,v=y-.5,scale=400/(2*FEATURE_HALF_WIDTH);return {x:200+scale*(.8*u+.6*v),y:154-scale*(-9*u+12*v+25*z)/(5*Math.sqrt(34))};}
export function featureSurface(stage:SpaceStage,n=12){const result:number[]=[];for(let i=0;i<n;i++)for(let j=0;j<n;j++){const x=i/n,y=j/n,x1=(i+1)/n,y1=(j+1)/n;/* Split on the negative diagonal so the ReLU crease x+y=1 is exact. */for(const [u,v]of [[x,y],[x1,y],[x,y1],[x1,y],[x1,y1],[x,y1]])result.push(...featureCoordinates(u,v,stage));}return result;}
export const OUTPUT_PLANE:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[0,0,-.25],[1,0,.25],[1,1,.75],[0,1,.25]];
/** Educational interpolation, not another activation or a training step. */
export function morphCoordinates(x:number,y:number,position:number):[number,number,number]{const p=Math.max(0,Math.min(2,position)),a=x+y-1;const z=p<=1?p*a:a+(p-1)*(Math.max(0,a)-a);return [x,y,z===0?0:z];}
export function morphSample(x:number,y:number,position:number){const h=morphCoordinates(x,y,position),raw=h[0]+h[1]-2*h[2]-.5,score=Math.abs(raw)<1e-12?0:raw;return {h,score,predicted:(score>=0?1:0) as 0|1};}
export function morphIntersections(position:number){
 const p=Math.max(0,Math.min(2,position)),roots:number[]=[];
 function root(lo:number,hi:number){const f0=morphSample(lo,0,p).score,f1=morphSample(hi,0,p).score,slope=(f1-f0)/(hi-lo);if(Math.abs(slope)<1e-12)return;const r=lo-f0/slope;if(r>=lo-1e-10&&r<=hi+1e-10&&!roots.some(x=>Math.abs(x-r)<1e-10))roots.push(Math.max(lo,Math.min(hi,r)));}
 root(0,1);root(1,2);
 return roots.map(sum=>{const ends=sum<=1?[[0,sum],[sum,0]]:[[sum-1,1],[1,sum-1]];return ends.map(([x,y])=>morphCoordinates(x,y,p));});
}
export function morphSurface(position:number,n=12){const vertices=featureSurface(0,n);for(let i=0;i<vertices.length;i+=3)vertices[i+2]=morphCoordinates(vertices[i],vertices[i+1],position)[2];return vertices;}
export function exactStage(position:number):SpaceStage|null{const n=Math.round(position);return Math.abs(position-n)<1e-9?n as SpaceStage:null;}

/** Main view: fixed raw inputs plus computed final score height, never hidden h3. */
export const FINAL_SCORE_SCALE=.5;
export const SCORE_REFERENCE_PLANE:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[0,0,0],[1,0,0],[1,1,0],[0,1,0]];
export const FINAL_SCORE_TINT={negative:'#FF5C64',positive:'#6DFF8F',zero:'#bcbcb5'} as const;
export function finalScorePosition(x:number,y:number,position:number):[number,number,number]{return [x,y,morphSample(x,y,position).score*FINAL_SCORE_SCALE];}
export function finalScoreSurface(position:number,n=12){const vertices=featureSurface(0,n);for(let i=0;i<vertices.length;i+=3)vertices[i+2]=finalScorePosition(vertices[i],vertices[i+1],position)[2];return vertices;}
export function finalScoreIntersections(position:number){return morphIntersections(position).map(line=>line.map(([x,y])=>[x,y,0] as [number,number,number]));}
/** Split at the activation crease and exact zero contour before applying signed fills. */
export function finalScoreRegions(position:number){
 const triangles=[[[0,0],[1,0],[0,1]],[[1,0],[1,1],[0,1]]],out:Array<{positive:boolean;vertices:number[]}>=[];
 for(const triangle of triangles)for(const positive of [false,true]){const polygon:number[][]=[];for(let i=0;i<triangle.length;i++){const a=triangle[i],b=triangle[(i+1)%triangle.length],u=morphSample(a[0],a[1],position).score*(positive?1:-1),v=morphSample(b[0],b[1],position).score*(positive?1:-1);if(u>=0)polygon.push(a);if((u>=0)!==(v>=0)){const t=u/(u-v);polygon.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}const vertices:number[]=[];for(let j=1;j+1<polygon.length;j++)for(const [x,y]of [polygon[0],polygon[j],polygon[j+1]])vertices.push(...finalScorePosition(x,y,position));out.push({positive,vertices});}
 return out;
}
