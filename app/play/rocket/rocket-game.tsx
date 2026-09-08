"use client";
import {useEffect,useRef,useState} from 'react';
import {DT,initialState,step,policyThrottle,type Policy} from '../../../lib/rocket/physics.mjs';
import FlightScene from './flight-scene';
import {resetRound,cameraTarget,firstBurn} from '../../../lib/rocket/experience.mjs';
import styles from './rocket.module.css';
type Phase='ready'|'running'|'paused'|'done';
const names={energy:'Energy PPO',standard:'Standard PPO'};
export default function RocketGame(){
 const audio=useRef<{context:AudioContext;gain:GainNode;osc:OscillatorNode}|null>(null);
 const [sound,setSound]=useState(false);
 const [stage,setStage]=useState('learn');
 const [camera,setCamera]=useState({human:65,ai:65});
 const cameraRef=useRef({human:65,ai:65});
 const [opponent,setOpponent]=useState<keyof typeof names>('energy');
 const [model,setModel]=useState<Policy|null>(null);
 const [error,setError]=useState('');
 const [heightMode,setHeightMode]=useState('auto');
 const [startHeight,setStartHeight]=useState(50);
 const [speed,setSpeed]=useState(.25);
 const [throttle,setThrottle]=useState(0);
 const [phase,setPhase]=useState<Phase>('ready');
 const [burns,setBurns]=useState<{human:number|null;ai:number|null}>({human:null,ai:null});
 const [snapshot,setSnapshot]=useState({human:initialState(),ai:initialState(),throttle:0,aiThrottle:0});
 const game=useRef(resetRound(50));
 useEffect(()=>{const controller=new AbortController();fetch(`/rocket/${opponent}.json`,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('模型加载失败');return r.json();}).then(setModel).catch(e=>{if(e.name!=='AbortError')setError('策略暂时未能加载，请刷新页面重试。');});return()=>controller.abort();},[opponent]);
 useEffect(()=>{
  let frame=0,last=0,acc=0;
  const tick=(now:number)=>{
   const g=game.current;
   if(g.phase==='running'&&model){
    acc+=last?Math.min((now-last)/1000,.1)*speed:0;
    while(acc>=DT){
     acc-=DT;
     const throttle=g.throttle;
     g.humanBurn=firstBurn(g.humanBurn,throttle*300,g.human.h);
     g.human=step(g.human,throttle);
     if(!g.ai.result){if(g.steps%5===0)g.aiThrottle=policyThrottle(g.ai,model);g.aiBurn=firstBurn(g.aiBurn,g.aiThrottle*300,g.ai.h);g.ai=step(g.ai,g.aiThrottle);}
     g.steps++;
     setSnapshot({human:g.human,ai:g.ai,aiThrottle:g.ai.result?0:g.aiThrottle,throttle:g.human.result?0:throttle});
     if(g.human.result&&g.ai.result){g.phase='done';setBurns({human:g.humanBurn,ai:g.aiBurn});setPhase('done');break;}
    }
   }else acc=0;
   const ease=1-Math.exp(-Math.min(last?(now-last)/1000:0,.1)*4);
   cameraRef.current={
    human:cameraRef.current.human+(cameraTarget(g.human.h,g.human.h,startHeight)-cameraRef.current.human)*ease,
    ai:cameraRef.current.ai+(cameraTarget(g.ai.h,g.ai.h,startHeight)-cameraRef.current.ai)*ease
   };
   setCamera(cameraRef.current);
   last=now;frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  const pause=()=>{const g=game.current;if(g.phase==='running'){g.phase='paused';setPhase('paused');}};
  window.addEventListener('blur',pause);document.addEventListener('visibilitychange',pause);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',pause);};
 },[model,speed,startHeight]);
 useEffect(()=>()=>{void audio.current?.context.close();},[]);
 useEffect(()=>{if(audio.current){const a=audio.current;a.gain.gain.setTargetAtTime(sound&&phase==='running'?snapshot.human.thrust/300*.035:0,a.context.currentTime,.08);a.osc.frequency.setTargetAtTime(45+snapshot.human.thrust/5,a.context.currentTime,.08);}},[sound,phase,snapshot.human.thrust]);
 function toggleSound(){if(!audio.current){const context=new AudioContext();const gain=context.createGain();gain.gain.value=0;const osc=context.createOscillator();osc.type='sawtooth';osc.connect(gain);gain.connect(context.destination);osc.start();audio.current={context,gain,osc};}void audio.current.context.resume();setSound(!sound);}
 function prepare(height:number){game.current=resetRound(height);setStartHeight(height);setThrottle(0);setPhase('ready');setSnapshot({human:game.current.human,ai:game.current.ai,aiThrottle:0,throttle:0});cameraRef.current={human:cameraTarget(height,height,height),ai:cameraTarget(height,height,height)};setCamera(cameraRef.current);}
 function newCourse(mode:string,random:number){prepare(mode==='auto'?Math.round((45+random*10)*10)/10:Number(mode));}
 function start(){if(!model)return;const g=game.current;if(g.phase==='done'){game.current=resetRound(startHeight);setThrottle(0);setSnapshot({human:game.current.human,ai:game.current.ai,aiThrottle:0,throttle:0});cameraRef.current={human:cameraTarget(startHeight,startHeight,startHeight),ai:cameraTarget(startHeight,startHeight,startHeight)};setCamera(cameraRef.current);}game.current.phase='running';setPhase('running');}
 function changeThrottle(value:number){const next=Math.max(0,Math.min(100,value));game.current.throttle=next/100;setThrottle(next);}
 function choose(value:keyof typeof names){if(value===opponent)return;setModel(null);setError('');prepare(startHeight);setOpponent(value);}
 function selectStage(value:string){setStage(value);setSpeed(value==='learn'?.25:value==='duel'?.5:1);prepare(startHeight);}
 const h=snapshot.human,a=snapshot.ai;
 const hoverThrottle=(10+h.fuel)*9.81/300*100;
 const result=phase==='done'?(h.result==='success'&&a.result!=='success'?'你赢了，成功带回火箭！':h.result!=='success'&&a.result==='success'?'AI 先胜一局，再试一次。':h.result!=='success'?'双方都没能软着陆，再挑战一次。':Math.abs(h.fuel-a.fuel)<.01?'双方成功，燃料消耗接近。':h.fuel>a.fuel?'你赢了，这次你更省燃料！':'双方成功，AI 更省燃料。'):'';
 return <main className={styles.page}>
  <div className={styles.cockpit}>
  <div className={styles.sessionTools}><span>回收挑战</span><button onClick={toggleSound} aria-pressed={sound}>{sound?"声音开":"声音关"}</button></div>
  <div className={styles.modeBar}>{[['learn','01 初次回收'],['duel','02 挑战 AI'],['fuel','03 节油挑战']].map(([value,label])=><button key={value} aria-pressed={stage===value} disabled={phase==='running'||phase==='paused'} onClick={()=>selectStage(value)}>{label}</button>)}</div>
  <div className={styles.mission}><div><h1>{stage==='learn'?'先把火箭带回家。':stage==='duel'?'这一局，挑战 AI。':'稳稳落地，还要省油。'}</h1><p>{stage==='learn'?'先练习软着陆，AI 在旁边示范。':'同一高度、同一燃料，看看谁回收得更好。'}</p></div><details className={styles.settings}><summary>设置 · {speed}× / {startHeight} m</summary><div>
   <label>对手<select value={opponent} disabled={phase==='running'||phase==='paused'} onChange={e=>choose(e.target.value as keyof typeof names)}><option value="energy">Energy PPO</option></select></label>
   <label>速度<select value={speed} disabled={phase==='running'||phase==='paused'} onChange={e=>setSpeed(Number(e.target.value))}>{[.125,.25,.5,1].map(v=><option key={v} value={v}>{v}×</option>)}</select></label>
   <label>高度<select value={heightMode} disabled={phase==='running'||phase==='paused'} onChange={e=>{setHeightMode(e.target.value);newCourse(e.target.value,Math.random());}}><option value="auto">随机 45–55 m</option><option value="30">30 m</option><option value="50">50 m</option><option value="80">80 m</option></select></label>
  </div></details></div>
  <FlightScene human={h} ai={a} view={camera} aiName={names[opponent]}/>
  {phase==='done'&&<section className={styles.debrief} role="status"><strong>{stage==='learn'?(h.result==='success'?'第一次回收，完成！':'这次没停稳，再试一次。'):result}</strong><p>你：{Math.abs(h.v).toFixed(1)} m/s · 耗油 {(5-h.fuel).toFixed(2)} kg　AI：{Math.abs(a.v).toFixed(1)} m/s · 耗油 {(5-a.fuel).toFixed(2)} kg</p><p>{burns.human===null?'这局没有点火，下一次尝试提早点火减速。':`你在 ${burns.human.toFixed(1)} m 首次点火；${burns.ai===null?'AI 没有点火':`AI 在 ${burns.ai.toFixed(1)} m 首次点火`}。`}{h.result==='crash'?' 着陆需要把速度降至 2 m/s 以内。':''}</p></section>}
  <div className={styles.pilotControls}>
   <div className={styles.controlLabel}><label htmlFor="rocket-throttle">油门 <output>{throttle}%</output></label><span className={styles.balanceReadout} title="推力等于重力的稳态油门；不计空气阻力，发动机响应有延迟。">平衡 {h.fuel>0?hoverThrottle.toFixed(1)+'%':'不可用'}</span><span className={styles.aiReadout}>AI 油门 {Math.round(snapshot.aiThrottle*100)}%</span><span>{error||(!model?'策略加载中…':phase==='paused'?'已暂停':phase==='ready'?'向右加力 · 松手保持':'向左减力 · 最左熄火')}</span></div>
   <div className={styles.touchThrottle} onPointerDown={e=>{if(!model||h.result||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();changeThrottle(Math.round((e.clientX-r.left-14)/(r.width-28)*100));}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const r=e.currentTarget.getBoundingClientRect();changeThrottle(Math.round((e.clientX-r.left-14)/(r.width-28)*100));}}>
    <div className={styles.track}><i style={{width:`${throttle}%`}}/><b style={{left:`${throttle}%`}}/>{h.fuel>0&&<span className={styles.hoverMarker} style={{left:`${hoverThrottle}%`}} aria-hidden="true"><i/><em>平衡</em></span>}<span className={styles.aiMarker} style={{left:`${snapshot.aiThrottle*100}%`}} aria-hidden="true"><em>AI</em><i/></span></div>
    <input id="rocket-throttle" type="range" min="0" max="100" step="1" value={throttle} disabled={!model||!!h.result} onChange={e=>changeThrottle(Number(e.target.value))} aria-valuetext={`${throttle}% 油门`}/>
   </div>
   <div className={styles.actionRow}><button className={styles.startButton} disabled={!model} onClick={()=>{if(phase==='running'){game.current.phase='paused';setPhase('paused');}else start();}}>{phase==='done'?'同关再试':phase==='paused'?'继续飞行':phase==='running'?'暂停':'开始回收'}</button><button className={styles.nextButton} disabled={phase==='running'||phase==='paused'} onClick={()=>newCourse(heightMode,Math.random())}>换一关 ↻</button>{phase==='done'&&stage!=='fuel'&&h.result==='success'&&<button className={styles.nextButton} onClick={()=>selectStage(stage==='learn'?'duel':'fuel')}>下一挑战 →</button>}</div>
  </div>
  </div>

  <footer className={styles.footer}>源自 ycy 的 DRL Rocket Landing Control · 浏览器实时运行公开 PPO 权重，非录像。<br/>基于原项目物理，积分步长 0.01 秒，策略每 0.05 秒决策，安全辅助关闭。双方独立缩放高度坐标，屏幕位置不能直接比较高度；提示为忽略阻力及燃料约束的制动估计，不保证安全。30 / 80 米超出默认训练初始范围。人类与 AI 都使用连续油门。这是互动体验，不是算法性能评测。</footer>
 </main>;
}
