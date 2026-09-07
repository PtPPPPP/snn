import {useEffect,useRef,useState} from "react";
import type {Flight} from '../../../lib/rocket/physics.mjs';
import styles from './rocket.module.css';
export function flightHint(s:Flight){
 if(s.result)return s.result==='success'?'回收成功':s.result==='crash'?'落地过快':s.result==='out_of_bounds'?'飞离回收区':'飞行终止';
 if(s.fuel<=0)return '燃料耗尽';
 if(s.t===0)return '等待出发';
 if(s.v>1)return '正在上升 · 减小油门';
 if(Math.abs(s.v)<=2&&s.h<8)return '保持稳定 · 准备接地';
 const distance=Math.max(0,(s.v*s.v-4)/(2*Math.max(300/(10+s.fuel)-9.81,.01)));
 return s.h<distance+3?'尽快加力 · 降低速度':s.h<distance*1.7+5?'准备点火制动':'留意高度 · 保留燃料';
}
export default function FlightScene({human,ai,view,aiName}:{human:Flight;ai:Flight;view:{human:number;ai:number};aiName:string}){
 const ref=useRef<HTMLDivElement>(null);
 const [height,setHeight]=useState(380);
 useEffect(()=>{if(!ref.current)return;const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)setHeight(600*entry.contentRect.height/entry.contentRect.width);});observer.observe(ref.current);return()=>observer.disconnect();},[]);
 const ground=height-30, flightArea=Math.max(1,height-100);
 return <div className={styles.scene}>
  <div className={styles.hud}>{[{s:human,name:'你',color:'var(--snn-control)'},{s:ai,name:aiName,color:'var(--snn-accent)'}].map(({s,name,color})=>{
   const braking=Math.max(0,(s.v*s.v-4)/(2*Math.max(300/(10+s.fuel)-9.81,.01)));
   const safe=Math.abs(s.v)<=2;
   const danger=!s.result&&s.v < -2&&(s.h<braking+3||s.h<5);
   const speedTone=s.result?(s.result==='success'?'safe':'danger'):danger?'danger':s.t>0&&safe?'safe':'normal';
   const altitudeTone=!s.result&&s.h<10?'near':'normal';
   const speedLabel=s.result?(s.result==='success'?'软着陆成功':'飞行结束'):s.t===0?'等待出发':danger?'立即加力减速':safe?'软着陆速度内':s.v>0?'正在上升':'正在下降';
   return <div key={name} style={{borderColor:color}}>
    <strong style={{color}}>{name}</strong>
    <div className={styles.telemetry}>
     <div className={styles.metric} data-tone={altitudeTone}><small>高度</small><span>{s.h.toFixed(1)}<small>m</small></span><small>{s.result?'已结束':s.h<10?'接近地面':'距地面'}</small></div>
     <div className={styles.metric} data-tone={speedTone}><small>垂直速度</small><span>{s.v.toFixed(1)}<small>m/s</small></span><small>{speedLabel}</small></div>
    </div>
    <div className={styles.fuel}><i style={{width:`${s.fuel/5*100}%`,background:color}}/></div><small>燃料 {s.fuel.toFixed(2)} kg</small>
   </div>;
  })}</div>
  <div className={styles.flightViewport} ref={ref}>
  <svg viewBox={`0 0 600 ${height}`} role="img" aria-label={`同场回收：你高度 ${human.h.toFixed(1)} 米，AI 高度 ${ai.h.toFixed(1)} 米，独立坐标，你 ${view.human.toFixed(1)} 米，AI ${view.ai.toFixed(1)} 米`}>
   <rect width="600" height={height} fill="var(--snn-bg)"/>
   {[{range:view.human,left:24,right:280},{range:view.ai,left:320,right:576}].map(({range,left,right})=>{
    const step=range<=15?2:range<=30?5:range<=70?10:20;
    return <g key={left}>{Array.from({length:Math.floor(range/step)},(_,i)=>(i+1)*step).map(m=><g key={m}><line x1={left} x2={right} y1={ground-m/range*flightArea} y2={ground-m/range*flightArea} stroke="var(--snn-border)" strokeDasharray="2 6"/><text x={left} y={ground-m/range*flightArea-5} fill="var(--snn-text-muted)" fontSize="10" fontFamily="monospace">{m} m</text></g>)}</g>;
   })}
   <line x1="300" x2="300" y1="16" y2={ground} stroke="var(--snn-border-soft)"/>
   <line x1="24" x2="576" y1={ground+3} y2={ground+3} stroke="var(--snn-border-strong)"/>
   {[{s:human,range:view.human,x:165,color:'var(--snn-control)',name:'HUMAN'},{s:ai,range:view.ai,x:435,color:'var(--snn-accent)',name:'AI'}].map(({s,range,x,color,name})=>{
    const zoom=1;
    const y=ground-s.h/range*flightArea-20*zoom;
    const landed=s.result==='success',crashed=!!s.result&&!landed;
    return <g key={name}>
     <rect x={x-51} y={ground+1} width="102" height="5" fill={crashed?'var(--snn-error)':landed?'var(--snn-success)':color}/>
     <text x={x} y={height-7} textAnchor="middle" fontSize="9" letterSpacing="3" fill={color}>{name} / PAD</text>
     <g transform={`translate(${x} ${y}) scale(${zoom})`}>
      {s.thrust>0&&!s.result&&<g stroke={color} fill="none" strokeWidth="1.2"><path d={`M-3 15 L0 ${19+s.thrust/300*30} L3 15`}/><path d={`M0 18 V${23+s.thrust/300*23}`} opacity=".35"/></g>}
      {crashed?<g stroke="var(--snn-error)" fill="none"><path d="M-14 13 L-3 4 L3 14 L14 8 M-8 -8 L8 8 M8 -8 L-8 8"/><text y="-23" textAnchor="middle" fill="var(--snn-error)" stroke="none" fontSize="10">未能回收</text></g>:<g stroke={color} strokeWidth="1.2" fill="var(--snn-bg)">
       <path d="M-5 12 V-26 L-3 -32 H3 L5 -26 V12Z"/>
       <path d="M-5 -20 H5 M-5 5 H5 M-3 12 V15 H3 V12" fill="none"/>
       <path d="M-5 5 L-13 20 H-17 M5 5 L13 20 H17" fill="none"/>
       <path d="M-5 -15 L-10 -12 V-8 L-5 -10 M5 -15 L10 -12 V-8 L5 -10" fill="none"/>
       <path d="M-2 -18 V1" opacity=".3"/>
       {landed&&<text y="-42" textAnchor="middle" fill="var(--snn-success)" stroke="none" fontSize="11">回收成功</text>}
      </g>}
     </g>
    </g>;
   })}
  </svg>
  </div>
  <div className={styles.sceneCaption}><span>{flightHint(human)}</span><small>独立坐标 · 你 {view.human.toFixed(0)} m / AI {view.ai.toFixed(0)} m</small></div>
 </div>;
}
