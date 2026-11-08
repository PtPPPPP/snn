"use client";

import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {coordinate,fmt,grid,shownPoint,snap,trace,type CourseModel,type Point,type Sample} from '../../../lib/learning/geometry-course';
import {valueColor} from '../../../lib/design/value-color';
import s from './geometry-course.module.css';

const RED='#FF5F65',GREEN='#79FF8B',WHITE='#E8E8E2',DIM='#62625e',FAINT='#383835';
function useCanvas(draw:(ctx:CanvasRenderingContext2D,width:number,height:number)=>void){
 const canvas=useRef<HTMLCanvasElement>(null),paint=useRef(draw),near=useRef(false),frame=useRef(0);paint.current=draw;
 const render=()=>{const el=canvas.current;if(!el)return;const box=el.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);if(!box.width||!box.height)return;el.width=Math.round(box.width*ratio);el.height=Math.round(box.height*ratio);const ctx=el.getContext('2d');if(!ctx)return;ctx.scale(ratio,ratio);ctx.font='11px "Courier New", monospace';ctx.textAlign='center';ctx.textBaseline='middle';paint.current(ctx,box.width,box.height);};
 const schedule=()=>{if(!near.current||frame.current)return;frame.current=requestAnimationFrame(()=>{frame.current=0;render();});};
 useEffect(()=>{const el=canvas.current;if(!el)return;const observer=new ResizeObserver(schedule),visible=new IntersectionObserver(([entry])=>{near.current=entry.isIntersecting;if(near.current)schedule();else if(frame.current){cancelAnimationFrame(frame.current);frame.current=0;}},{rootMargin:'600px 0px'});observer.observe(el);visible.observe(el);return()=>{near.current=false;observer.disconnect();visible.disconnect();if(frame.current)cancelAnimationFrame(frame.current);frame.current=0;};},[]);
 useEffect(()=>{schedule();});
 return canvas;
}
export function PointField({model,input,data,onPick,onLine,sides=false,unoriented=false,selected=true}:{model:CourseModel;input:Point;data:Sample[];onPick:(point:Point)=>void;onLine?:(point:Point)=>void;sides?:boolean;unoriented?:boolean;selected?:boolean}){
 const dragging=useRef(false),canvas=useCanvas((ctx,width,height)=>{
  const left=30,top=20,w=width-55,h=height-45;
  const xy=(p:Point)=>[left+p[0]*w,top+(1-p[1])*h];
  const score=(p:Point)=>trace(model,p).s;
  for(const point of grid){const [x,y]=xy(point),value=score(point);ctx.fillStyle=sides?(Math.abs(value)<1e-8?WHITE:value>0?GREEN:RED):FAINT;ctx.globalAlpha=sides?.5:1;ctx.fillText(sides?(Math.abs(value)<1e-8?'0':value>0?'+':'-'):'.',x,y);}ctx.globalAlpha=1;
  for(let row=0;row<=24;row++)for(let col=0;col<=40;col++){
   const p:[number,number]=[col/40,row/24],value=score(p),nx=score([Math.min(1,p[0]+1/40),p[1]]),ny=score([p[0],Math.min(1,p[1]+1/24)]);
   const sign=(v:number)=>Math.abs(v)<1e-8?0:Math.sign(v),v=sign(value),nextMax=Math.max(sign(nx),sign(ny)),nextMin=Math.min(sign(nx),sign(ny));
   if((v<=0&&nextMax>0)||(v>0&&nextMin<=0)){const [x,y]=xy(p);ctx.fillStyle=WHITE;const {linear}=model;ctx.fillText(Math.abs(linear[1])<.2?'|':Math.abs(linear[0])<.2?'-':linear[0]*linear[1]>0?'\\':'/',x,y);}
  }
  for(const {point,label} of data){const [x,y]=xy(point);ctx.fillStyle=label?GREEN:RED;ctx.font='bold 13px "Courier New", monospace';ctx.fillText(String(label),x,y);}ctx.font='11px "Courier New", monospace';
  if(onLine){const [x,y]=xy([.5,.5]);ctx.fillStyle=WHITE;ctx.fillText('+',x,y);}
  if(!onLine&&selected){const [x,y]=xy(input);ctx.fillStyle=WHITE;ctx.font='bold 14px "Courier New", monospace';ctx.fillText('@',x,y);}
  ctx.fillStyle=DIM;ctx.font='10px "Courier New", monospace';ctx.fillText('x₂',left-15,top);ctx.fillText('x₁',left+w,top+h+18);ctx.fillText('−1',left-12,top+h);ctx.fillText('1',left-12,top);ctx.fillText('0',left+w/2,top+h/2+12);
  if(unoriented){ctx.fillText('只看两组是否分处两侧',width/2,height-5);}
 });
 const locate=(event:PointerEvent<HTMLCanvasElement>):Point=>{const box=event.currentTarget.getBoundingClientRect();return [snap((event.clientX-box.left-30)/(box.width-55)),snap(1-(event.clientY-box.top-20)/(box.height-45))];};
 return <canvas ref={canvas} className={s.field} role="img" aria-label={onLine?'分类任务：直线只能绕中心旋转，不能平移；也可使用图旁旋转控件':'离散坐标平面：点选字符格，@表示当前点；旁边坐标控件可用键盘操作'} onPointerDown={event=>{dragging.current=true;event.currentTarget.setPointerCapture(event.pointerId);(onLine??onPick)(locate(event));}} onPointerMove={event=>{if(dragging.current)(onLine??onPick)(locate(event));}} onPointerUp={()=>dragging.current=false} onPointerCancel={()=>dragging.current=false}/>;
}

type Hit={x:number;y:number;point:Point};
export function ScoreSurface({model,input,onPick,count=81,hidden=false,neutral=false,axisLabel,samples=[],showSelection=true}:{model:CourseModel;input:Point;onPick:(point:Point)=>void;count?:number;hidden?:boolean;neutral?:boolean;axisLabel?:string;samples?:Sample[];showSelection?:boolean}){
 const [camera,setCamera]=useState({yaw:-.65,pitch:.65}),drag=useRef<{x:number;y:number;distance:number}|null>(null),hits=useRef<Hit[]>([]);
 const canvas=useCanvas((ctx,width,height)=>{
  const value=(p:Point)=>hidden?trace(model,p).h:trace(model,p).s;
  const amplitude=Math.max(.5,...grid.map(p=>Math.abs(value(p)))),scale=Math.min(width*.3,height*.42/(1+amplitude*.45)),cx=width*.5,cy=height*.55;
  // Zoom all axes together; never normalize only z, which would hide a changed slope.
  const project=(x:number,y:number,z:number)=>{const a=coordinate(x)*Math.cos(camera.yaw)-coordinate(y)*Math.sin(camera.yaw),b=coordinate(x)*Math.sin(camera.yaw)+coordinate(y)*Math.cos(camera.yaw);return {x:cx+a*scale,y:cy+b*Math.sin(camera.pitch)*scale-z*Math.cos(camera.pitch)*scale*.7,depth:b*Math.cos(camera.pitch)+z*.7*Math.sin(camera.pitch)};};
  ctx.fillStyle=FAINT;for(const p of grid){const q=project(p[0],p[1],0);ctx.fillText('.',q.x,q.y);}
  const segments:[number[],number[],string][]=[[[.5,.5,0],[1.1,.5,0],'x₁'],[[.5,.5,0],[.5,1.1,0],'x₂'],[[.5,.5,-amplitude],[.5,.5,amplitude],'s']];
  for(const [a,b,label] of segments){ctx.fillStyle=DIM;for(let i=0;i<21;i++){const t=i/20,q=project(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t);ctx.fillText(i%2?':':'.',q.x,q.y);}const end=project(b[0],b[1],b[2]);ctx.fillStyle=WHITE;ctx.fillText(label==='s'?(axisLabel??(hidden?'h':'s')):label,end.x+8,end.y-8);}
  hits.current=[];
  const points=grid.slice(0,count).map(point=>({point,value:value(point),...project(point[0],point[1],value(point))})).sort((a,b)=>a.depth-b.depth);
  for(const q of points){ctx.fillStyle=hidden||neutral?WHITE:q.value>=0?GREEN:RED;ctx.globalAlpha=samples.length?.3:1;ctx.font=`${Math.max(5,Math.min(11,scale*.23))}px "Courier New", monospace`;ctx.fillText(hidden?(q.value===0?'.':'#'):neutral?'#':q.value>=0?'1':'0',q.x,q.y);hits.current.push({x:q.x,y:q.y,point:q.point});}ctx.globalAlpha=1;
  for(const item of samples){const q=project(item.point[0],item.point[1],value(item.point));ctx.fillStyle=item.label?GREEN:RED;ctx.font='bold 13px "Courier New", monospace';ctx.fillText(String(item.label),q.x,q.y);hits.current.push({x:q.x,y:q.y,point:item.point});}
  const index=grid.findIndex(p=>p[0]===input[0]&&p[1]===input[1]);if(showSelection&&((index<count&&index>=0)||samples.some(p=>p.point[0]===input[0]&&p.point[1]===input[1]))){const q=project(input[0],input[1],value(input));ctx.fillStyle=WHITE;ctx.font='bold 14px "Courier New", monospace';ctx.fillText('@',q.x,q.y);}
  ctx.fillStyle=DIM;ctx.font='10px "Courier New", monospace';ctx.textAlign='left';ctx.fillText(`${axisLabel??(hidden?'h':'s')} 范围 ${hidden?'0':'−'+fmt(amplitude)} … ${fmt(amplitude)}`,8,height-8);ctx.textAlign='center';
 });
 return <div><canvas ref={canvas} className={s.surface} role="img" aria-label={`${hidden?'ReLU 折面':'三维分数面'}，已显示 ${count} / 81 个离散分数；拖动旋转，点击分数点重新选点`} onPointerDown={event=>{drag.current={x:event.clientX,y:event.clientY,distance:0};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!drag.current)return;const dx=event.clientX-drag.current.x,dy=event.clientY-drag.current.y;drag.current.distance+=Math.abs(dx)+Math.abs(dy);drag.current.x=event.clientX;drag.current.y=event.clientY;setCamera(old=>({yaw:old.yaw+dx*.008,pitch:Math.max(.2,Math.min(1.35,old.pitch+dy*.008))}));}} onPointerUp={event=>{if(drag.current&&drag.current.distance<5){const box=event.currentTarget.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;const hit=hits.current.map(p=>({...p,d:(p.x-x)**2+(p.y-y)**2})).sort((a,b)=>a.d-b.d)[0];if(hit&&hit.d<225)onPick(hit.point);}drag.current=null;}} onPointerCancel={()=>drag.current=null}/><div className={s.figureFoot}><span>拖动旋转 · 点选 @</span><button onClick={()=>setCamera({yaw:-.65,pitch:.65})}>[正视]</button></div></div>;
}

export function ReluCharacters({a,active=true}:{a:number;active?:boolean}){
 const bound=Math.max(1,Math.ceil(Math.abs(a))),offset=Math.round(Math.min(1,Math.abs(a)/bound)*7),col=9+(a<0?-offset:offset),row=a>0?7-offset:active?7:7+offset;
 const drawing=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>{let ch=x===9?'|':y===7?'-':' ';if(active&&y===7&&x<9&&x>0)ch='_';if((!active||y<7)&&x===16-y&&y!==7)ch='/';if(x===9&&y===7)ch='+';return <span key={x} className={x===col&&y===row?s.current:undefined}>{x===col&&y===row?'@':ch}</span>;}));
 return <figure className={s.function}><figcaption>{active?'h = max(0, a)':'h = a'}</figcaption><pre>{drawing.map((line,i)=><span key={i}>{line}{i<14?'\n':''}</span>)}</pre><small>−{bound}　　　 0　　　 {bound} a</small></figure>;
}

export function LossHistory({values}:{values:number[]}){
 const max=Math.max(.75,...values),cols=44,rows=6,plot=Array.from({length:rows},()=>Array(cols).fill(' '));
 values.forEach((value,i)=>{const x=Math.round(i/Math.max(1,values.length-1)*(cols-1)),y=rows-1-Math.round(Math.min(1,value/max)*(rows-1));plot[y][x]=i===values.length-1?'@':'.';});
 return <div className={s.history}><span>平均损失<br/><b>{fmt(values[values.length-1])}</b></span><pre aria-label={`平均损失轨迹，从 ${fmt(values[0])} 到 ${fmt(values[values.length-1])}`}>{plot.map((row,i)=>`${i===0?fmt(max).padStart(6):i===rows-1?'     0':'      '} |${row.join('')}`).join('\n')}</pre></div>;
}
