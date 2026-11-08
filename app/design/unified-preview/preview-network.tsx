"use client";

import {useEffect,useRef} from 'react';
import {coordinate,fmt,trace,type CourseModel,type Point} from '../../../lib/learning/geometry-course';
import {valueColor} from '../../../lib/design/value-color';
import s from '../../learn/neural-networks/geometry-course.module.css';

type Hit={x:number;y:number;index:number};
// Preview-only copy of the existing glyph renderer; narrow layout keeps its labels in frame.
export default function NetworkGlyphs({model,input,phase,onSelect,bias}:{model:CourseModel;input:Point;phase:number;onSelect:(index:number)=>void;bias:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),hits=useRef<Hit[]>([]),latest=useRef({model,input,phase,bias}),scheduleRef=useRef<()=>void>(()=>{});latest.current={model,input,phase,bias};
 useEffect(()=>{
  const element=canvas.current;if(!element)return;
  const paint=()=>{
   const box=element.getBoundingClientRect(),width=box.width,height=box.height,ratio=Math.min(devicePixelRatio||1,2);if(!width)return;element.width=Math.round(width*ratio);element.height=Math.round(height*ratio);const ctx=element.getContext('2d');if(!ctx)return;ctx.scale(ratio,ratio);ctx.textAlign='center';ctx.textBaseline='middle';hits.current=[];
   const {model,input,phase,bias}=latest.current,t=trace(model,input),full=model.activation==='relu',compact=width<420,x=coordinate(input[0]),y=coordinate(input[1]),radius=compact?20:full?25:27;
   const ball=(cx:number,cy:number,value:number,name:string,index:number,ready:boolean)=>{
    const shade=' .:-=+*#%@',color=ready?valueColor(value):'#454541',cw=radius/8,ch=radius/5.2;ctx.font=`${full?5.7:6}px "Courier New", monospace`;ctx.fillStyle=color;
    for(let row=-5;row<=5;row++)for(let col=-8;col<=8;col++){const nx=col/8,ny=row/5,r=nx*nx+ny*ny;if(r>1)continue;const z=Math.sqrt(1-r),light=Math.max(0,Math.min(1,.25-.25*nx-.22*ny+.72*z));ctx.fillText(shade[Math.round(light*(shade.length-1))],cx+col*cw,cy+row*ch);}
    const text=ready?Number(value.toFixed(3)).toString():'.';ctx.fillStyle='#151515';ctx.fillRect(cx-text.length*3.5-2,cy-7,text.length*7+4,14);ctx.fillStyle=ready?'#E8E8E2':'#62625e';ctx.font='11px "Courier New", monospace';ctx.fillText(text,cx,cy);ctx.fillText(name,cx,cy-radius-13);hits.current.push({x:cx,y:cy,index});
   };
   const route=(ax:number,ay:number,bx:number,by:number,weight:number,name:string,index:number,ready:boolean)=>{
    ctx.font='8px "Courier New", monospace';ctx.fillStyle=ready?valueColor(weight):'#444440';const start=ax+radius*.9,end=bx-radius*.9;
    for(let i=0;i<18;i++){const f=i/17,px=start+(end-start)*f,py=ay+(by-ay)*(f*f*(3-2*f));ctx.fillText(i%3===1?'.':by<ay?'/':by>ay?'\\':'-',px,py);if(phase===1&&i===10)ctx.fillText('>',px,py);}
    const mx=(start+end)/2,my=(ay+by)/2;ctx.font='10px "Courier New", monospace';ctx.fillStyle=ready?'#BCBCB5':'#62625e';ctx.fillText(`${name} ${fmt(weight)}`,mx,my+(by>ay?-12:12));hits.current.push({x:mx,y:my,index});
   };
   const inputX=full?width*.12:width*.17,outX=full?(compact?Math.min(width*.76,width-radius-45):width*.83):width*.68,inY1=height*.28,inY2=height*.72,outY=height*.5;
   if(full){
    const hx=width*(compact?.43:.47),ys=[height*.18,height*.5,height*.82];route(inputX,inY1,hx,ys[0],1,'',0,phase>=1);route(inputX,inY2,hx,ys[1],1,'',1,phase>=1);route(inputX,inY1,hx,ys[2],model.hinge[0],'w₁',3,phase>=1);route(inputX,inY2,hx,ys[2],model.hinge[1],'w₂',4,phase>=1);
    [x,y,t.h].forEach((v,i)=>{route(hx,ys[i],outX,outY,i===2?model.gain:model.linear[i],`v${i+1}`,i===2?6:i,phase>=3);ball(hx,ys[i],i===2?t.a:v,i===2?'a':'h'+(i+1),i===2?5:i,phase>=1);ctx.font='9px "Courier New", monospace';ctx.fillStyle=phase>=2?'#BCBCB5':'#62625e';const opX=compact?hx:hx+radius+26;ctx.fillText(i===2?'[ReLU]':'[Linear]',opX,compact?ys[i]+radius+9:ys[i]-9);ctx.fillText(i===2?'h='+fmt(t.h):'h='+fmt(v),opX,compact?ys[i]+radius+19:ys[i]+5);});
   }else{route(inputX,inY1,outX,outY,model.linear[0],'w₁',0,phase>=1);route(inputX,inY2,outX,outY,model.linear[1],'w₂',1,phase>=1);}
   ball(inputX,inY1,x,'x₁',0,true);ball(inputX,inY2,y,'x₂',1,true);ball(outX,outY,t.s,'s',2,phase>=(full?3:2));ctx.font='9px "Courier New", monospace';ctx.fillStyle=phase>=3?'#BCBCB5':'#62625e';ctx.fillText('[Linear]',outX+radius+(compact?22:28),outY-6);ctx.fillText('f(z)=z',outX+radius+(compact?22:28),outY+7);if(bias){ctx.fillText(`+ ${full?'b₀':'b'} ${fmt(model.linear[2])}`,outX,outY+radius+18);}
  };
  let near=false,frame=0;
  const schedule=()=>{if(!near||frame)return;frame=requestAnimationFrame(()=>{frame=0;paint();});};scheduleRef.current=schedule;
  const observer=new ResizeObserver(schedule),visible=new IntersectionObserver(([entry])=>{near=entry.isIntersecting;if(near)schedule();else if(frame){cancelAnimationFrame(frame);frame=0;}},{rootMargin:'600px 0px'});
  observer.observe(element);visible.observe(element);return()=>{near=false;observer.disconnect();visible.disconnect();if(frame)cancelAnimationFrame(frame);scheduleRef.current=()=>{};};
 },[]);
 useEffect(()=>{scheduleRef.current();},[model,input,phase,bias]);
 return <canvas ref={canvas} className={s.networkCanvas} role="img" aria-label={`${model.activation==='relu'?'带 ReLU 的 2→3→1':'两个输入到一个 Linear 输出的'}字符网络，输入 (${input.map(coordinate).map(fmt).join(', ')})，当前分数 ${fmt(trace(model,input).s)}。点击球体或连接选择对应参数。`} onClick={event=>{const box=event.currentTarget.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top,hit=hits.current.map(p=>({...p,d:(p.x-x)**2+(p.y-y)**2})).sort((a,b)=>a.d-b.d)[0];if(hit&&hit.d<1600)onSelect(hit.index);}}/>;
}
