"use client";
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,type PointerEvent,type KeyboardEvent} from 'react';
import {DURATION,FRONT,OBLIQUE,boundaryFor,boundarySegment,cameraProject,caseData,classify,clippedRegion,correctCount,demoFrame,orbitCamera,type Camera,type CaseId} from '../../../lib/learning/opening-demo';
import s from './opening-demo.module.css';
import {HeroThreeView,ClassificationThreeView} from './three-view';
import './charcoal-tokens.css';
import ClassifierLesson from './classifier-lesson';
import NonlinearSpace from './nonlinear-space';

const fieldGlyphs=(id:CaseId)=>Array.from({length:23},(_,row)=>Array.from({length:31},(_,col)=>{const x=-1+(col+.5)*2/31,y=1-(row+.5)*2/23,prediction=classify({x,y},boundaryFor(id));return <text key={`${row}:${col}`} x={120*x} y={-120*y} fill={prediction===1?'var(--opening-secondary)':'var(--opening-muted)'}>{prediction===1?'+':':'}</text>;}));
const FIELDS={separable:fieldGlyphs('separable'),xor:fieldGlyphs('xor')};
export default function OpeningDemo(){
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[reduced,setReduced]=useState(false),[manualCamera,setManualCamera]=useState<Camera|null>(null);
 const [rendererMode,setRendererMode]=useState<'loading'|'webgl'|'fallback'>('loading');
 const rendererStatus=useRef<'loading'|'webgl'|'fallback'>('loading');
 const scene=useRef<HTMLDivElement>(null),started=useRef(false),inView=useRef(false),drag=useRef<{id:number;x:number;y:number;touch:boolean}|null>(null);
 const onRendererMode=useCallback((mode:'webgl'|'fallback')=>{rendererStatus.current=mode;setRendererMode(mode);if(mode==='fallback')setPlaying(false);else if(inView.current&&!started.current&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){started.current=true;setPlaying(true);}},[]);
 const frame=demoFrame(time),id=frame.dataset,points=caseData(id),line=boundaryFor(id),camera=manualCamera??frame.camera;
 const oblique=camera.tilt>.4,wrong=points.find(p=>classify(p,line)!==p.label),count=correctCount(id);
 useEffect(()=>{
  const node=scene.current;if(!node)return;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const observer=new IntersectionObserver(([entry])=>{inView.current=entry.intersectionRatio>=.55;setReduced(media.matches);if(!inView.current)setPlaying(false);else if(!started.current&&rendererStatus.current==='webgl'){started.current=true;if(!media.matches)setPlaying(true);}},{threshold:[0,.55]});
  observer.observe(node);const preference=()=>{setReduced(media.matches);if(media.matches)setPlaying(false);};media.addEventListener('change',preference);
  const hidden=()=>{if(document.hidden)setPlaying(false);};document.addEventListener('visibilitychange',hidden);
  return()=>{observer.disconnect();media.removeEventListener('change',preference);document.removeEventListener('visibilitychange',hidden);};
 },[]);
 useEffect(()=>{
  if(!playing||reduced)return;let handle=0,last=performance.now();
  const tick=(now:number)=>{const delta=Math.min(64,now-last);last=now;if(inView.current&&!document.hidden)setTime(current=>Math.min(DURATION,current+delta));handle=requestAnimationFrame(tick);};
  handle=requestAnimationFrame(tick);return()=>cancelAnimationFrame(handle);
 },[playing,reduced]);
 useEffect(()=>{if(!frame.finished)return;const handle=requestAnimationFrame(()=>setPlaying(false));return()=>cancelAnimationFrame(handle);},[frame.finished]);
 const p=(x:number,y:number)=>cameraProject(x,y,camera);
 const path=(values:readonly {x:number;y:number}[])=>values.map((v,i)=>{const q=p(v.x,v.y);return `${i?'L':'M'}${q.x},${q.y}`;}).join(' ');
 function replay(){setTime(0);setManualCamera(null);setPlaying(!reduced&&rendererStatus.current==='webgl');}
 function inspect(next:CaseId){setPlaying(false);setTime(next==='separable'?5000:DURATION);}
 function view(){setPlaying(false);setManualCamera(oblique?FRONT:OBLIQUE);}
 function down(e:PointerEvent<HTMLElement>){if(rendererMode==='webgl')return;if(!e.isPrimary||e.button!==0)return;setPlaying(false);setManualCamera(camera);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,touch:e.pointerType==='touch'};e.currentTarget.setPointerCapture(e.pointerId);}
 function move(e:PointerEvent<HTMLElement>){const previous=drag.current;if(!previous||previous.id!==e.pointerId)return;const dx=(e.clientX-previous.x)*.006,dy=previous.touch?0:(e.clientY-previous.y)*.008;setManualCamera(current=>orbitCamera(current??camera,dx,dy));drag.current={...previous,x:e.clientX,y:e.clientY};}
 function up(e:PointerEvent<HTMLElement>){if(drag.current?.id!==e.pointerId)return;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 function keyboard(e:KeyboardEvent<HTMLElement>){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();setPlaying(false);setManualCamera(e.key==='Home'?FRONT:orbitCamera(camera,e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0,e.key==='ArrowUp'?-.15:e.key==='ArrowDown'?.15:0));}
 const heading=id==='separable'?'这一组，一条线就够了。':'换一组点，直线遇到了局限。';
 return <main className={s.opening} data-opening-prototype data-charcoal-opening><div className={s.shell}>
  <nav className={s.masthead} aria-label="开场导航"><Link href="/">SNN</Link><span>01 / 分类</span></nav>
  <header className={s.intro}><h1>先看分类，<br/>再看空间如何折叠。</h1><p>从一条分类边界开始，逐步走进神经网络。<br/>先看示范，再转动视角，观察结果怎样变化。</p></header>
  <figure className={s.concept}><HeroThreeView/><figcaption><span>概念预览 · 空间变换</span><span>这张折叠曲面用于引入视觉主题，并非训练结果。</span></figcaption></figure>
  <a href="#classification-demo" className={s.begin}>先看分类示范</a><p className={s.beginNote}>可以暂停、重播，或转动视角。</p>
  <section id="classification-demo" className={s.demonstration} aria-label="两种分类情况的开场示范">
   <div className={s.sceneHeader}><span className={s.caseLabel}>{id==='separable'?'第一组 · 可以直线分开':'第二组 · XOR'}</span><span className={s.score}>{count} / {points.length} <small>当前分对</small></span></div>
   <figure className={s.figure}>
    <div ref={scene} className={s.classificationViewport} role="group" tabIndex={0} aria-label={`${id==='separable'?'线性可分点':'四个异或角点'}的三维网格平面。左右方向键旋转，上下方向键改变倾斜，Home 正视。拖动只改变视角，不改变数据。`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={keyboard}>
     <ClassificationThreeView orbit onInteract={()=>setPlaying(false)} view={camera} id={id} proof={id==='xor'&&frame.phase==='question'} opacity={reduced?1:frame.pointOpacity} onMode={onRendererMode} fallback={<svg viewBox="0 0 400 308" aria-hidden="true">
     <path d={path([{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}])+'Z'} fill="var(--opening-bg)" stroke="var(--opening-rule)" strokeWidth="1"/>
     <path d={path(clippedRegion(line,false))+'Z'} fill="var(--opening-region-0)" fillOpacity=".65"/>
     <path d={path(clippedRegion(line,true))+'Z'} fill="var(--opening-region-1)" fillOpacity=".7"/>
     <g aria-hidden="true" className={s.asciiPlane} transform={`matrix(${Math.cos(camera.yaw)} ${-Math.sin(camera.yaw)*Math.cos(camera.tilt)} ${Math.sin(camera.yaw)} ${Math.cos(camera.yaw)*Math.cos(camera.tilt)} 200 154)`}>{FIELDS[id]}</g>
     {[-1,-.75,-.5,-.25,0,.25,.5,.75,1].map(value=><g key={value}><path d={path([{x:value,y:-1},{x:value,y:1}])} stroke={value===0?'#797970':'#353532'} strokeWidth={value===0?1:.6} fill="none"/><path d={path([{x:-1,y:value},{x:1,y:value}])} stroke={value===0?'#797970':'#353532'} strokeWidth={value===0?1:.6} fill="none"/></g>)}
     {id==='xor'&&frame.phase==='question'&&<g stroke="#8d8d84" strokeDasharray="3 4" strokeWidth="1" opacity=".7"><path d={path([points[0],points[1]])}/><path d={path([points[2],points[3]])}/></g>}
     <path d={path(boundarySegment(line))} stroke="var(--opening-ink)" strokeWidth="1.6" fill="none"/>
     <g opacity={reduced?1:frame.pointOpacity}>{points.map(point=>{const q=p(point.x,point.y),error=classify(point,line)!==point.label;return <g key={point.id}><title>{`类别 ${point.label}，输入 (${point.x}, ${point.y})，当前${error?'分错':'分对'}`}</title>{error&&<circle cx={q.x} cy={q.y} r="12" fill="none" stroke="var(--opening-ink)" strokeWidth="1.4" strokeDasharray="2 3"/>}{point.label===0?<rect x={q.x-6} y={q.y-6} width="12" height="12" fill="var(--opening-bg)" stroke="var(--opening-class-0)" strokeWidth="1.5"/>:<path transform={`translate(${q.x} ${q.y})`} d="M-3 -7H3V-5H5V-3H7V3H5V5H3V7H-3V5H-5V3H-7V-3H-5V-5H-3Z" fill="var(--opening-class-1)" stroke="var(--opening-bg)" strokeWidth="1"/>}</g>;})}</g>
     {wrong&&<g opacity={reduced?1:frame.pointOpacity}><path d={`M${p(wrong.x,wrong.y).x+14} ${p(wrong.x,wrong.y).y}h22`} stroke="var(--opening-muted)"/><text x={p(wrong.x,wrong.y).x+40} y={p(wrong.x,wrong.y).y+4} className={s.errorLabel}>分错</text></g>}
     <text x={p(1.12,0).x} y={p(1.12,0).y+19} textAnchor="middle" className={s.axis}>x₁</text><text x={p(0,1.12).x} y={Math.max(20,p(0,1.12).y-9)} textAnchor="middle" className={s.axis}>x₂</text>
    </svg>}/>

    </div>
    <figcaption><span><i className={s.square}/>类别 0</span><span><i className={s.dot}/>类别 1</span><span><i className={s.line}/>分类直线</span><small>形状表示真实类别；字符 : 预测 0，字符 + 预测 1。</small></figcaption>
   </figure>
   <div className={s.transport}><button className={s.primary} disabled={rendererMode==='loading'} onClick={()=>{if(reduced||rendererMode==='fallback'){inspect(id==='separable'?'xor':'separable');}else if(frame.finished){replay();}else setPlaying(current=>!current);}}>{rendererMode==='loading'?'加载三维场景':rendererMode==='fallback'?'查看另一组（二维）':reduced?'换一组点':frame.finished?'再看一次':playing?'暂停示范':'继续示范'}</button><button onClick={replay} aria-label="从正视第一组点重新播放">重播</button><button onClick={view}>{oblique?'切回正视':'转到斜视'}</button>{rendererMode==='webgl'&&!playing&&!reduced&&<button onClick={()=>inspect(id==='separable'?'xor':'separable')}>{id==='separable'?'看第二组':'看第一组'}</button>}</div>
   <div className={s.progress} aria-hidden="true"><i style={{width:`${time/DURATION*100}%`}}/></div>
   <div className={s.caption} aria-live="polite" aria-atomic="true"><h2>{heading}</h2><p>{id==='separable'?'空心方点在一边，实心像素点在另一边。转动网格，只是换个角度看同一次分类。':'这里明确换了数据：同一类在相对的两个角。当前这条线分对 3 个点；不是再调好一点就能全部分开，任何直线都做不到。'}</p></div>
   <p className={s.viewNote}>{playing?'示范进行中，可随时暂停。':'横向拖动或用方向键转动；手机纵向滑动继续阅读。'} 所有点始终留在同一个平面上。</p>
  </section>
  {id==='xor'&&<aside className={s.question}><span>留下一个问题</span><h2>如果直线不够，<br/>能不能改变空间本身？</h2><p>换视角没有改变问题。下一步要想的，是怎样改变点的表示，而不只是转动这张平面。</p><details><summary>为什么这四个点不能被直线完全分开？</summary><p>把同类的两个点各自连起来，两条线段在中点相交。若一条直线能把两类放在严格相反的两侧，同类点之间的整条线段也必须留在各自一侧，就不可能在同一个中点相遇。这两条同类连接线只用于说明，不是额外的分类线。</p></details></aside>}
  <ClassifierLesson/>
  <NonlinearSpace/>
  <footer className={s.footer}><span>开场只改变视角；后续用手工网络变换坐标，尚未训练网络。</span><Link href="/learn/neural-networks/archive">旧版参考</Link></footer>
 </div></main>;
}
