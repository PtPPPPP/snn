"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import {clone,coordinate,evaluate,fmt,fromParameters,gradient,initialCourse,learningSamples,parameters,samplesFor,shownPoint,snap,trace,update,type CourseState,type Point} from '../../../lib/learning/geometry-course';
import {onNotebookEntry,useLessonFlow} from './lesson-flow';
import {LossHistory,PointField,ScoreSurface} from './geometry-figures';
import NetworkGlyphs from './network-glyphs';
import s from './geometry-course.module.css';

type Mode='design'|'stuck-center'|'bias'|'learn-linear'|'manual-xor'|'learn-xor'|'relu-network'|'learn-relu';
const phases=['送入坐标','分别乘权重','把贡献相加','Linear 原样输出','放到分数面上'];
const reluPhases=['送入坐标','隐藏单元加权求和','经过 Linear / ReLU','输出单元加权求和','Linear → 放到分数面上'];
function entryState(mode:Mode){
 const state=initialCourse();
 state.model.linear=[1,0,0];
 if(['stuck-center','bias','learn-linear'].includes(mode))state.dataset='shifted';
 if(['manual-xor','learn-xor'].includes(mode)){state.dataset='xor';state.model.linear=[1,0,-.5];}
 // Both ReLU activities start unsolved; the learning activity never receives the manual answer.
 if(mode==='relu-network'||mode==='learn-relu'){state.dataset='xor';state.model={linear:[1,1,1],hinge:[1,1,0],gain:0,activation:'relu'};}
 return state;
}
function Rail({label,controlLabel,value,onChange,bound=4}:{label:string;controlLabel:string;value:number;onChange:(n:number)=>void;bound?:number}){
 const limit=Math.max(bound,Math.ceil(Math.abs(value))),mark=Math.round((value+limit)/(2*limit)*20);
 return <label className={s.range}><span>{label}<output>{fmt(value)}</output></span><span className={s.rail} aria-hidden="true">[{Array.from({length:21},(_,i)=><span key={i} className={i===mark?s.current:undefined}>{i===mark?'|':i<mark?'=':'.'}</span>)}]</span><input type="range" aria-label={controlLabel} min={-limit} max={limit} step=".1" value={value} onChange={event=>onChange(Number(event.target.value))}/></label>;
}
export default function NetworkLab({mode,id}:{mode:Mode;id:string}){
 const flow=useLessonFlow(),root=useRef<HTMLDivElement>(null),entry=useRef<CourseState|null>(null),visible=useRef(false);
 const [state,setState]=useState(()=>entryState(mode)),current=useRef(state),[phase,setPhase]=useState(4),[playing,setPlaying]=useState(false),[auto,setAuto]=useState(false),[view,setView]=useState<'plane'|'points'>('plane'),[rate,setRate]=useState(.2),[steps,setSteps]=useState(0),[history,setHistory]=useState<number[]>([]),[pending,setPending]=useState<number[]|null>(null),[tracked,setTracked]=useState(mode.includes('relu')?6:0),[settled,setSettled]=useState(false);
 const [last,setLast]=useState<{before:number;gradient:number;after:number}|null>(null);
 const training=mode==='learn-linear'||mode==='learn-xor'||mode==='learn-relu',full=mode.includes('relu'),hasBias=!['design','stuck-center'].includes(mode);
 const initialize=useCallback(()=>{if(entry.current)return current.current;const next=entryState(mode);entry.current=clone(next);current.current=next;setState(next);flow.publish(id,next);setHistory([evaluate(next.model,learningSamples(next)).loss]);return next;},[flow,id,mode]);
 const change=(next:CourseState)=>{current.current=next;setState(next);flow.publish(id,next);};
 useEffect(()=>{const el=root.current;if(!el)return;const stop=onNotebookEntry(el,initialize),observer=new IntersectionObserver(([item])=>{visible.current=item.isIntersecting;if(!item.isIntersecting){setAuto(false);setPlaying(false);}},{threshold:0});observer.observe(el);return()=>{stop();observer.disconnect();};},[initialize]);
 useEffect(()=>{if(!playing)return;const timer=window.setTimeout(()=>{if(document.hidden||!visible.current){setPlaying(false);return;}if(phase===4){setPlaying(false);return;}setPhase(v=>v+1);},500);return()=>clearTimeout(timer);},[playing,phase]);
 useEffect(()=>{if(!auto)return;const timer=window.setInterval(()=>{
  if(document.hidden||!visible.current){setAuto(false);return;}
  const next=clone(current.current),before=parameters(next.model)[tracked],losses:number[]=[];
  let added=0,lastGradient:number[]=[];
  for(let i=0;i<5;i++){const data=learningSamples(next),g=gradient(next.model,data);lastGradient=g;const model=update(next.model,g,rate),value=evaluate(model,data).loss;if(!Number.isFinite(value)){setAuto(false);return;}next.model=model;losses.push(value);added++;if(Math.max(...g.map(Math.abs))<.0001){setAuto(false);setSettled(true);break;}}
  setLast({before,gradient:lastGradient[tracked],after:parameters(next.model)[tracked]});change(next);setSteps(n=>n+added);setHistory(values=>[...values,...losses]);setPhase(4);
 },160);return()=>clearInterval(timer);},[auto,rate,tracked]);
 function setParameter(index:number,value:number){const old=initialize(),next=clone(old),values=parameters(next.model);values[index]=value;next.model=fromParameters(values,next.model.activation);change(next);setPending(null);setLast(null);setAuto(false);setPlaying(false);setPhase(4);setSettled(false);}
 function pick(point:Point){const next=clone(initialize());next.input=[snap(point[0]),snap(point[1])];change(next);setPhase(4);setPlaying(false);}
 function reset(){const next=clone(entry.current??initialize());change(next);setAuto(false);setPlaying(false);setPending(null);setLast(null);setPhase(4);setSteps(0);setSettled(false);setHistory([evaluate(next.model,learningSamples(next)).loss]);}
 function oneStep(){const old=initialize();setAuto(false);if(!pending){setPending(gradient(old.model,learningSamples(old)));setLast(null);return;}const next=clone(old);next.model=update(old.model,pending,rate);change(next);setLast({before:parameters(old.model)[tracked],gradient:pending[tracked],after:parameters(next.model)[tracked]});setHistory(values=>[...values,evaluate(next.model,learningSamples(next)).loss]);setSteps(n=>n+1);setPending(null);setPhase(4);}
 const data=samplesFor(state),learning=learningSamples(state),score=evaluate(state.model,data),metric=evaluate(state.model,learning),t=trace(state.model,state.input),names=full?['v₁','v₂','b₀','w₁','w₂','bₕ','v₃']:['w₁','w₂','b'],values=parameters(state.model);
 const calculation=tracked<2?`${names[tracked]} × x${tracked+1} = ${fmt(values[tracked])} × ${fmt(coordinate(state.input[tracked]))} = ${fmt(values[tracked]*coordinate(state.input[tracked]))}`:tracked===2?`输出求和${hasBias?`（含 ${full?'b₀':'b'} = ${fmt(values[2])}）`:''} = ${fmt(t.s)}`:tracked===3||tracked===4?`${names[tracked]} × x${tracked-2} = ${fmt(values[tracked])} × ${fmt(coordinate(state.input[tracked-3]))} = ${fmt(values[tracked]*coordinate(state.input[tracked-3]))}`:tracked===5?`a = ${fmt(t.a)}，ReLU(a) = max(0, ${fmt(t.a)}) = ${fmt(t.h)}`:`v₃ × h = ${fmt(values[6])} × ${fmt(t.h)} = ${fmt(values[6]*t.h)}`;
 const plot=<div><div className={s.plotHeading}><span>{view==='plane'?'同一网络生成的分数面':'同一规则的分类边界'}</span><button onClick={()=>setView(v=>v==='plane'?'points':'plane')}>[{view==='plane'?'看输入点':'看分数面'}]</button></div>{view==='plane'?<ScoreSurface model={state.model} input={state.input} onPick={pick} samples={data} showSelection={phase===4}/>:<PointField model={state.model} input={state.input} data={data} onPick={pick} sides/>}<small>绿 1 应在上方，红 0 应在下方。</small></div>;
 return <div className={`${s.activity} ${s.networkLab}`} ref={root} data-network-lab={mode}>
  <div className={s.toolbar}><span className={s.quiet}>{training?'本节独立学习 · 从未解好的初值开始':hasBias?'本节独立操作':'本节只有两个可调连接'}</span><button className={s.reset} onClick={reset}>[复位本节]</button></div>
  <div className={s.figureToolbar}><button onClick={()=>{initialize();setAuto(false);setPhase(0);setPlaying(true);}}>[重播传递]</button><button disabled={playing} onClick={()=>{initialize();setPhase(v=>v===4?0:v+1);}}>[下一步]</button><span>{phase+1}/5 · {full?reluPhases[phase]:phases[phase]}</span></div>
  {full?<><NetworkGlyphs model={state.model} input={state.input} phase={phase} bias onSelect={setTracked}/><div className={s.pair}><PointField model={state.model} input={state.input} data={data} onPick={pick} sides/>{plot}</div></>:<div className={s.pair}><NetworkGlyphs model={state.model} input={state.input} phase={phase} bias={hasBias} onSelect={setTracked}/>{plot}</div>}
  <div className={s.labReadout}><span>@ ({shownPoint(state.input)}) → s = <b>{phase>=3?fmt(t.s):'待输出'}</b></span><span>分对 <b>{score.correct}/{score.total}</b></span></div>
  <p className={s.selectedCalculation}>当前计算 · {calculation}</p>
  {!training&&<div className={s.labSliders}>{(full?[tracked]:hasBias?[0,1,2]:[0,1]).map(index=><Rail key={index} label={names[index]} controlLabel={`${id} · ${names[index]}`} value={values[index]} bound={index===2?2:4} onChange={value=>setParameter(index,value)}/>)}{full&&<><label>参数 <select aria-label="折面网络参数" value={tracked} onChange={event=>setTracked(Number(event.target.value))}>{names.map((name,i)=><option key={name} value={i}>{name}</option>)}</select></label><button onClick={()=>setParameter(6,-2)}>[接入 −2h]</button></>}</div>}
  {training&&<><div className={s.figureToolbar}><button onClick={oneStep} disabled={auto}>[{pending?'应用更新':'计算梯度'}]</button><button onClick={()=>{initialize();setPending(null);setSettled(false);setPlaying(false);setAuto(v=>!v);}}>[{auto?'暂停学习':'自动学习'}]</button><label>η <select aria-label={`${id} 学习率`} value={rate} onChange={event=>{setAuto(false);setPending(null);setRate(Number(event.target.value));}}>{[.05,.1,.2,.5].map(v=><option key={v}>{v}</option>)}</select></label><span>已更新 {steps} 次</span></div><div className={s.gradientReadout}><label>观察 <select aria-label={`${id} 跟踪参数`} value={tracked} onChange={event=>{setAuto(false);setLast(null);setTracked(Number(event.target.value));}}>{names.map((name,i)=><option key={name} value={i}>{name}</option>)}</select></label><span>当前 {fmt(values[tracked])}</span><span>梯度 {pending?fmt(pending[tracked]):last?fmt(last.gradient):'待计算'}</span><span>{pending?`更新后 ${fmt(values[tracked]-rate*pending[tracked])}`:last?`${fmt(last.before)} → ${fmt(last.after)}`:'计算时不改参数'}</span></div><LossHistory values={history.length?history:[metric.loss]}/><p className={s.local}>{settled?'本轮梯度已经很小。':''}平均损失 {fmt(metric.loss)} · {learning.length} 个样本一起计算梯度，每次同时更新 {full?7:3} 个参数。</p></>}
  {!training&&<p className={s.local}>{full?'h = ReLU(w₁x₁+w₂x₂+bₕ)；s = v₁x₁+v₂x₂+b₀+v₃h':`s = ${fmt(values[0])}x₁ ${values[1]<0?'−':'+'} ${fmt(Math.abs(values[1]))}x₂${hasBias?` ${values[2]<0?'−':'+'} ${fmt(Math.abs(values[2]))}`:''}`}{!hasBias&&' · 中心 (0, 0) 的分数始终为 0'}</p>}
 </div>;
}
