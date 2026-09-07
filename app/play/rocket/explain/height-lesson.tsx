"use client";
import {useEffect,useState,useRef} from 'react';
import {initialState,type Policy} from '../../../../lib/rocket/physics.mjs';
import {flightReplay,type ReplayFrame} from '../../../../lib/rocket/replay.mjs';
import {nodeCalculation} from '../../../../lib/rocket/decision-lesson.mjs';
import NeuronPlayground from './neuron-playground';
import RocketTutor from './rocket-tutor';
import LessonNetwork from './lesson-network';
import styles from './lesson.module.css';
const names=['离地高度','上下速度','剩余燃料','发动机推力','下落能量与刹车能力之比','下落能量与燃料储备之比','当前速度与安全速度的能量比'];
const steps=['读入数据','第一组计算','第二组计算','算出油门'];
const fmt=(v:number)=>v.toFixed(4);
export default function HeightLesson(){
 const [calcOpen,setCalcOpen]=useState(true);
 useEffect(()=>{const media=matchMedia('(min-width:651px)');const change=()=>setCalcOpen(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 const [data,setData]=useState<{model:Policy;frames:ReplayFrame[]}|null>(null),[error,setError]=useState('');
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(true),[speed,setSpeed]=useState(.25);
 const [askSnapshot,setAskSnapshot]=useState<{time:number;selection:string;context:string}|null>(null);
 const [stage,setStage]=useState(3),[picked,setPicked]=useState(0);
 useEffect(()=>{
  const ac=new AbortController();
  fetch('/rocket/energy.json',{signal:ac.signal}).then(r=>{if(!r.ok)throw new Error('load');return r.json();}).then((model:Policy)=>{
   const q=new URLSearchParams(window.location.search),raw=Number(q.get('h')??50);
   const height=Number.isFinite(raw)&&raw>0?Math.min(120,raw):50;
   setData({model,frames:flightReplay(model,initialState(height))});
  }).catch(e=>{if(e.name!=='AbortError')setError('无法加载飞行，请刷新重试。');});
  return()=>ac.abort();
 },[]);
 const playhead=useRef(0),slider=useRef<HTMLInputElement>(null),marker=useRef<HTMLDivElement>(null);
 const ended=!!data&&index===data.frames.length-1;
 useEffect(()=>{
  if(!playing||!data)return;
  const total=data.frames.at(-1)!.state.t;
  let animation=0,last=0;
  const tick=(now:number)=>{
   if(last&& !document.hidden)playhead.current+=(now-last)/1000*speed;
   last=now;
   if(playhead.current>total+.35*speed)playhead.current=0;
   const time=Math.min(total,playhead.current),progress=time/total;
   const next=Math.min(data.frames.length-1,Math.floor(time/.05+1e-7));
   setIndex(i=>i===next?i:next);
   if(slider.current)slider.current.value=String(progress*(data.frames.length-1));
   if(marker.current)marker.current.style.left=`calc(12px + (100% - 24px) * ${progress})`;
   animation=requestAnimationFrame(tick);
  };
  animation=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(animation);
 },[playing,speed,data]);
 if(!data)return <main className={styles.page}><p>{error||'正在生成真实策略的飞行轨迹…'}</p></main>;
 const {model,frames}=data,frame=frames[index],previous=frames[Math.max(0,index-1)];
 const state=frame.state,t=frame.trace,old=previous.trace,total=frames.at(-1)!.state.t;
 const layer=Math.max(0,stage-1),neuron=stage===3||stage===0?0:picked;
 const calc=nodeCalculation(t,model,layer,neuron);
 const ignition=frames.findIndex(f=>f.trace.throttle>.05);
 const status=state.result?(state.result==='success'?'成功接地':'飞行结束'):state.thrust>150?'点火制动':state.thrust>5?'调整推力':'自由下落';
 const rawValues=[frame.observed.h.toFixed(1)+' 米',frame.observed.v.toFixed(1)+' 米/秒',frame.observed.fuel.toFixed(2)+' 千克',frame.observed.thrust.toFixed(0)+' 牛'];
 const tutorSnapshot={time:frame.observed.t,selection:stage===0?names[picked]:stage===3?'输出神经元':`第${stage}组第${neuron+1}号神经元`,context:JSON.stringify({model:'Energy PPO 7-128-128-1',observed:frame.observed,displayedState:state,throttle:t.throttle,selectedLayer:stage,selectedNeuron:stage===0?picked+1:neuron+1,inputNames:names,networkInputs:t.inputs,calculation:stage===0?null:{sum:calc.sum,bias:calc.bias,output:calc.output,terms:calc.terms.map(v=>[v.index+1,...[v.input,v.weight,v.product].map(n=>Number(n.toFixed(5)))])},termColumns:['序号','输入','系数','贡献'],rule:'隐藏层所有贡献相加加b后Tanh；输出层线性求和后限制[-1,1]，(值+1)/2变成油门；速度负数为下降'})};
 function seek(i:number){const next=Math.max(0,Math.min(frames.length-1,Math.round(i)));playhead.current=frames[next].state.t;setIndex(next);}
 return <main className={styles.page} data-realtime="true">
  <nav><a href="/play/rocket">← 返回游戏</a><strong>网络怎样推理</strong><a href="/play/rocket/train">训练与奖励 →</a></nav>
  <NeuronPlayground/>
  <div className={styles.workspace}>
   <section className={styles.diagram}>
  <div className={styles.steps}>{steps.map((label,i)=><button key={label} aria-current={stage===i?'step':undefined} onClick={()=>{setStage(i);setPicked(0);}}>{label}</button>)}</div>

    <div className={styles.networkTools}><div><b>点选神经元，查看计算 ↓</b></div>{stage<3&&<label>{stage===0?'输入编号':'神经元编号'} <select aria-label="选择神经元编号" value={picked} onChange={e=>setPicked(Number(e.target.value))}>{Array.from({length:stage===0?7:128},(_,i)=><option key={i} value={i}>{i+1}{stage===0?' · '+names[i]:''}</option>)}</select></label>}</div>
    <LessonNetwork before={old} after={t} stage={stage} inputValues={rawValues} liveAll selected={stage===0?picked:neuron} playing={playing} model={model} onPick={(s,i)=>{setStage(s);setPicked(i);}}/>
    <p className={styles.legend}>蓝色为正贡献 · 棕橙色为负贡献 · 深浅表示大小，弱线省略绘制</p>
    <section className={styles.flightTimeline} aria-label="飞行时间轴">
     <div className={styles.compactReadings}><span>高度 <b>{state.h.toFixed(1)} m</b></span><span>速度 <b>{state.v.toFixed(1)} m/s</b></span><span>油门 <b>{(t.throttle*100).toFixed(1)}%</b></span></div>
     <div className={styles.playbackLine}><button onClick={()=>setPlaying(!playing)}>{playing?'暂停':'继续循环'}</button><input ref={slider} aria-label="飞行进度" type="range" min="0" max={frames.length-1} step="any" value={index} onChange={e=>seek(Number(e.target.value))}/><span>{state.t.toFixed(2)} / {total.toFixed(2)} s</span></div>
     <details className={styles.playbackMore}><summary>{status} · {speed}× · 更多控制</summary><div className={styles.timelineControls}><button disabled={index===0} onClick={()=>seek(index-1)}>上一帧</button><button disabled={ended} onClick={()=>seek(index+1)}>下一帧</button>{ignition>=0&&<button onClick={()=>seek(ignition)}>跳到首次点火</button>}<label>速度 <select value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.125,.25,.5,1].map(v=><option key={v} value={v}>{v}×</option>)}</select></label><span>燃料 {state.fuel.toFixed(2)} kg · 推力 {state.thrust.toFixed(0)} N</span></div></details>
    </section>
   </section>
   <div className={styles.inspector}><details className={styles.calcDetails} open={calcOpen} onToggle={e=>setCalcOpen(e.currentTarget.open)}><summary>{tutorSnapshot.selection} · {stage===3?`油门 ${(t.throttle*100).toFixed(1)}%`:stage===0?fmt(t.inputs[picked]):`输出 ${calc.output.toFixed(3)}`} <small>查看算式</small></summary><section className={styles.explanation}>
    <p className={styles.eyebrow}>{frame.observed.t.toFixed(2)} 秒 / {steps[stage]}</p>
    {state.result&&<p>已接地。网络保留接地前最后一次实际决策，未执行新的动作。</p>}
    {stage===0?<><h2>{names[picked]}</h2><p>速度是负数，表示正在往下落；绝对值越大，掉得越快。</p>{t.inputs.map((v,i)=>i===picked&&<div className={styles.term} key={i}><b>{names[i]}</b><span>{i<4?rawValues[i]:'把下落的能量与对应能力作比较，帮助判断来不来得及减速。'}</span><small>统一换算后，送入网络的数：{fmt(v)}</small></div>)}<details><summary>为什么要统一换算？</summary><p>米、千克、牛顿的数值大小不同。先按训练时保存的规则换算，让网络在熟悉的数值范围里计算；这不改变原来的物理状态。</p></details></>:<><h2>{stage===3?'输出神经元 · 油门':`第 ${stage} 组 · ${neuron+1} 号神经元`}</h2>
    <p>每条连线贡献一项，神经元把所有项相加。</p>
    <div className={styles.equation}>
     <div>a<sub>i</sub> = 第 i 个输入 × 它的系数</div>
     <div><b>S = a<sub>1</sub> + a<sub>2</sub> + a<sub>3</sub> + … + a<sub>n−1</sub> + a<sub>n</sub> + b</b></div>
     <div><b>输出 = f(S)</b></div>
    </div>
    <p>这里 n = {calc.terms.length}，共 {calc.terms.length} 项全部参与计算；b 是训练得到的固定数。</p>
    <div className={styles.resultCompare}><div><small>全部相加 S（含 b）</small><b>{calc.sum.toFixed(3)}</b></div><div><small>{stage===3?'换算后的油门':'函数输出 f(S)'}</small><b>{stage===3?(t.throttle*100).toFixed(1)+'%':calc.output.toFixed(3)}</b></div></div>
    <p>{stage===3?'f 的做法：先把 S 限制在 −1 到 1，再用（这个数 + 1）÷ 2 × 100% 得到油门。':'f 是一个平滑的压缩函数，把 S 变成 −1 到 1 之间的数，交给下一层。'}</p>
    <details><summary>看一项怎样算出来</summary><p>a<sub>1</sub> = {fmt(calc.terms[0].input)} × ({fmt(calc.terms[0].weight)}) = {fmt(calc.terms[0].product)}。其他项也按同样的规则计算，最后一起相加，再加 b = {fmt(calc.bias)}。</p>{stage<3&&<p>压缩函数叫 Tanh：输入越大，输出越接近 1；输入越小，输出越接近 −1。</p>}</details></>}


   </section></details>
  <RocketTutor snapshot={askSnapshot??tutorSnapshot} locked={!!askSnapshot} onFollow={()=>setAskSnapshot(null)} onLock={()=>setAskSnapshot(tutorSnapshot)}/>
   </div>
  </div>

  <footer>这段飞行由真实 Energy PPO 模型和游戏物理计算产生：每 0.01 秒更新运动，每 0.05 秒计算一次油门。从 {frames[0].state.h.toFixed(1)} 米静止释放，5 kg 燃料。时间轴回放已计算的轨迹，不是实时训练；拖动不会重新设定高度或速度。</footer>
 </main>;
}
