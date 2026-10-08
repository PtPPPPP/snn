/** Exact accepted conceptual surface. It is an illustration, not a trained model. */
export const FOLD_GLYPHS='.:;=+*#%@';
export const foldHeight=(u:number,v:number)=>.62*Math.abs(u)-.48*Math.abs(v)+.36*Math.abs(u+v)-.28*Math.abs(u-v)+.08*u;
export function foldProject(u:number,v:number){return {x:476+(u-v)*220,y:500+(u+v)*116-foldHeight(u,v)*301,depth:u+v+232/301*foldHeight(u,v)};}
export function facetLight(u:number,v:number){
 const e=.0001,du=(foldHeight(u+e,v)-foldHeight(u-e,v))/(2*e),dv=(foldHeight(u,v+e)-foldHeight(u,v-e))/(2*e);
 const dot=(.5*du+.25*dv+1)/(Math.hypot(du,dv,1)*Math.hypot(.5,.25,1));
 return Math.floor(80+155*Math.max(0,dot)+12*(u+1)/2);
}
type GlyphRun={x:number;y:number;text:string;light:number};
export function renderFold(columns=94){
 const width=952,height=790,dx=width/columns,dy=dx*1.7,rows=Math.ceil(height/dy),shade=new Float64Array(columns*rows),depth=new Float64Array(columns*rows).fill(-Infinity);
 const N=64,step=2/N;
 const edge=(a:{x:number;y:number},b:{x:number;y:number},x:number,y:number)=>(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
 for(let i=0;i<N;i++)for(let j=0;j<N;j++){
  const u=-1+i*step,v=-1+j*step;
  for(const vertices of [[[u,v],[u+step,v],[u+step,v+step]],[[u,v],[u+step,v+step],[u,v+step]]]){
   const a=foldProject(...vertices[0] as [number,number]),b=foldProject(...vertices[1] as [number,number]),c=foldProject(...vertices[2] as [number,number]);
   const area=edge(a,b,c.x,c.y);if(Math.abs(area)<1e-8)continue;
   const light=facetLight(vertices.reduce((n,p)=>n+p[0],0)/3,vertices.reduce((n,p)=>n+p[1],0)/3);
   const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x)/dx)),x1=Math.min(columns-1,Math.ceil(Math.max(a.x,b.x,c.x)/dx));
   const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y)/dy)),y1=Math.min(rows-1,Math.ceil(Math.max(a.y,b.y,c.y)/dy));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const sx=(x+.45)*dx,sy=(y+.48)*dy,w0=edge(b,c,sx,sy)/area,w1=edge(c,a,sx,sy)/area,w2=1-w0-w1;
    if(w0<-.00001||w1<-.00001||w2<-.00001)continue;
    const z=w0*a.depth+w1*b.depth+w2*c.depth,index=y*columns+x;
    if(z>depth[index]){depth[index]=z;shade[index]=light;}
   }
  }
 }
 const runs:GlyphRun[]=[];
 for(let row=0;row<rows;row++){
  let start=0,text='',last=-1;
  const flush=()=>{if(text)runs.push({x:start*dx,y:row*dy+dy*.82,text,light:last});};
  for(let col=0;col<columns;col++){
   const index=row*columns+col,value=shade[index];
   if(depth[index]===-Infinity){flush();text='';last=-1;continue;}
   const brightness=Math.round((120+(value-80)*.74)/8)*8;
   if(brightness!==last){flush();start=col;text='';last=brightness;}
   text+=FOLD_GLYPHS[Math.max(0,Math.min(8,Math.floor((value-75)/180*9)))];
  }flush();
 }
 const paths=[[-1,-1,-1,1],[1,-1,1,1],[0,-1,0,0],[0,0,1,-1]].map(([u0,v0,u1,v1])=>Array.from({length:100},(_,i)=>{const t=i/99,p=foldProject(u0+(u1-u0)*t,v0+(v1-v0)*t);return `${i?'L':'M'}${p.x},${p.y}`;}).join(' '));
 return {width,height,columns,rows,fontSize:dx*1.5,cellWidth:dx,runs,paths,corners:[[-1,-1],[-1,1],[1,1],[1,-1]].map(([u,v])=>foldProject(u,v))};
}
