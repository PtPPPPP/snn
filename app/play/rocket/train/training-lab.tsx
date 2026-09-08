"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import WeightHeatmap from './weight-heatmap';
import {traceNormalized,loadPPORecord,type PPORecord} from '../../../../lib/rocket/ppo-record';
import {nodeCalculation} from '../../../../lib/rocket/decision-lesson.mjs';
import s from './network.module.css';
const names=['高度','速度','燃料','实际推力','刹车能力比较','燃料储备比较','安全速度比较'];
const fmt=(v:number)=>Math.abs(v)>0&&Math.abs(v)<.0001?v.toExponential(2):v.toFixed(4);
export default function TrainingLab(){
 const [data,setData]=useState<PPORecord|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();loadPPORecord('/rocket/ppo-initialization.json',controller.signal).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[attempt]);
 if(!data)return <main className={s.page}><header><div><h1>网络怎样学习</h1><p>{error||'正在加载完整 PPO 网络与真实训练记录…'}</p></div></header>{error&&<button onClick={()=>{setError('');setAttempt(v=>v+1);}}>重试</button>}</main>;
 return <PPOPlayer data={data}/>;
}
function PPOPlayer({data}:{data:PPORecord}){
 const [clock,setClock]=useState(0),[speed,setSpeed]=useState(32),[playing,setPlaying]=useState(()=>typeof window==='undefined'||!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const introHold=useRef(1),elapsed=useRef(0),duration=data.rounds.length*8;
 const [edgeChoice,setEdgeChoice]=useState<number|null>(null);
 const [layer,setLayer]=useState(3),[node,setNode]=useState(0),[sampleIndex,setSampleIndex]=useState(0);

 useEffect(()=>{if(!playing)return;let raf=0,last=0;function tick(now:number){const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(!document.hidden){if(introHold.current>0){introHold.current-=dt;}else{const previous=elapsed.current;elapsed.current=(elapsed.current+dt*speed)%duration;if(elapsed.current<previous)introHold.current=1;setClock(elapsed.current);}}raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[playing,speed,duration]);
 const roundIndex=Math.min(data.rounds.length-1,Math.floor(clock/8)),progress=(clock%8)/8,phase=progress<.375?0:progress<.75?1:2;
 const round=data.rounds[roundIndex],sample=round.samples[Math.min(sampleIndex,round.samples.length-1)],oldModel=data.models[roundIndex],newModel=data.models[roundIndex+1];
 const before=useMemo(()=>traceNormalized(oldModel,sample.inputs),[oldModel,sample]);
 const pick=useCallback((l:number,n:number)=>{setLayer(l);setNode(n);setEdgeChoice(null);},[]);
 const calc=useMemo(()=>layer===0?null:nodeCalculation(before,oldModel,layer-1,node),[before,oldModel,layer,node]);
 const row=layer?oldModel.layers[layer-1].weight[node]:[],newRow=layer?newModel.layers[layer-1].weight[node]:[];
 const largest=row.reduce((best,v,i)=>Math.abs(newRow[i]-v)>Math.abs(newRow[best]-row[best])?i:best,0);
 const strongest=edgeChoice===null?largest:Math.min(row.length-1,edgeChoice);
 const heatLimit=useMemo(()=>{const values=data.models.slice(1).flatMap(m=>m.layers.flatMap((l,k)=>l.weight.flatMap((r,j)=>r.map((w,i)=>Math.abs(w-data.models[0].layers[k].weight[j][i]))))).sort((a,b)=>a-b);return values[Math.floor(values.length*.99)]||.01;},[data]);
 const heatPick=useCallback((l:number,n:number,i:number)=>{setLayer(l);setNode(n);setEdgeChoice(i);},[]);
 const gradient=layer?round.gradient[layer-1].weight[node][strongest]:0;
 function seek(v:number){introHold.current=v===0?1:0;elapsed.current=Math.max(0,Math.min(duration-.001,v));setClock(elapsed.current);setPlaying(false);}
 const label=layer===0?names[node]:layer===3?'输出神经元':`第 ${layer} 组 · ${node+1} 号神经元`;
 return <main className={`${s.page} ${s.recordPage}`} data-weight-updating={phase===2}>
  <header><div><small>03 / LEARNING LAB</small><h1>看权重，逐渐长出纹理。</h1><p>从变化为零的统一底色，看到训练如何留下冷暖交织的纹理。</p></div><span>从初始化开始的真实 PPO 记录<br/>7 → 128 → 128 → 1 · 完整策略网络</span></header>
  <div className={s.workspace}><section className={s.network}>
   <div className={s.networkHead}><b>{label}</b><span>暖色：增加 · 冷色：减少 · 相对初始化</span></div>
   <div className={s.nodePicker}><label>查看层 <select aria-label="选择网络层" value={layer} onChange={e=>pick(Number(e.target.value),0)}>{['输入层','第一组 · 128 个','第二组 · 128 个','输出层'].map((v,i)=><option key={i} value={i}>{v}</option>)}</select></label>{layer<3&&<label>神经元 <select aria-label="选择神经元编号" value={node} onChange={e=>setNode(Number(e.target.value))}>{Array.from({length:layer===0?7:128},(_,i)=><option key={i} value={i}>{i+1}{layer===0?' · '+names[i]:''}</option>)}</select></label>}</div>
   <WeightHeatmap initial={data.models[0]} current={oldModel} next={newModel} inputs={sample.inputs} progress={progress} limit={heatLimit} playing={playing} layer={layer} node={node} source={strongest} onPick={heatPick}/>
   <div className={s.heatLegend}><span>−{heatLimit.toFixed(3)}</span><i/><span>+{heatLimit.toFixed(3)}</span></div>
   <div className={s.roundPlayer} aria-label="训练回放控制">
    <div className={s.roundHeading}><strong>{clock===0?'初始化':`第 ${roundIndex+1}`} / {data.rounds.length} 轮</strong><span data-training-phase={phase}>{['前向传播 →','← 反向传播','权重更新 · 前后对照'][phase]}</span></div>
    <div className={s.roundTrack}><button onClick={()=>setPlaying(!playing)}>{playing?'暂停播放':'继续播放'}</button><input type="range" aria-label="训练轮次" min={0} max={duration-.001} step="any" value={clock} onChange={e=>seek(Number(e.target.value))}/><label>速度 <select aria-label="播放速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.25,1,2,4,8,16,32,64].map(v=><option key={v} value={v}>{v}×</option>)}</select></label></div>
    <div className={s.playPresets}><button onClick={()=>{setSpeed(32);setPlaying(true);}} aria-pressed={speed===32}>快速总览 · 32×</button><button onClick={()=>{setSpeed(1);setPlaying(true);}} aria-pressed={speed===1}>慢速细看 · 1×</button><details className={s.morePlayback}><summary>更多控制</summary><div><button aria-label="上一轮" onClick={()=>seek(Math.max(0,roundIndex-1)*8)}>← 上一轮</button><button aria-label="下一轮" onClick={()=>seek((roundIndex+1)*8)}>下一轮 →</button><button onClick={()=>seek(0)}>回到开头</button><small>真实记录回放 · 每轮 {round.steps.toLocaleString()} 个采样步；拖动进度条可定位并暂停。</small></div></details></div>
   </div>
   <p className={s.weightLegend}>同一底色表示“相对初始值，变化为零”，不表示所有权重相等。全程固定色阶，超出 ±{heatLimit.toFixed(3)} 的改变量饱和显示；不会每轮拉伸色阶。{phase===2?'正在逐层展开本轮真实改变量，过渡色仅用于演示':'当前显示本轮更新前'}。</p>
   <div className={s.samplePicker}><label>本轮样本 <select aria-label="训练样本" value={Math.min(sampleIndex,round.samples.length-1)} onChange={e=>setSampleIndex(Number(e.target.value))}>{round.samples.map((v,i)=><option key={i} value={i}>采样步 {v.index+1}</option>)}</select></label><span>固定输入对照 · 输出是均值，采样动作含探索噪声</span></div>
  </section><aside className={s.inspector}>
   <small>第 {roundIndex+1} 轮 / {['前向计算','反向求梯度','真实权重更新'][phase]}</small>
   <h2>连接的强弱，怎样形成？</h2>
   <p>每个格子是一条连接权重。飞行反馈形成损失，梯度从输出端反向传回；各层结合前向输入计算怎样调整权重。暖色表示比初始值增加，冷色表示减少。</p>
   <section className={s.calculation}><small>你选中的神经元</small><h3>{label}</h3>{calc?<>
    <label className={s.weightChoice}>查看哪条连线 <select aria-label="选择权重连线" value={edgeChoice===null?'auto':strongest} onChange={e=>setEdgeChoice(e.target.value==='auto'?null:Number(e.target.value))}><option value="auto">自动 · 本节点变化最大</option>{row.map((_,i)=><option key={i} value={i}>上一层 {i+1} 号 · Δ {fmt(newRow[i]-row[i])}</option>)}</select></label>
    <div className={s.weightEquation}><div><small>旧权重</small><strong>{fmt(row[strongest])}</strong></div><span>＋</span><div data-sign={newRow[strongest]>=row[strongest]?'positive':'negative'}><small>实际改变量</small><strong>{newRow[strongest]>=row[strongest]?'+':''}{fmt(newRow[strongest]-row[strongest])}</strong></div><span>＝</span><div><small>新权重</small><strong>{fmt(newRow[strongest])}</strong></div></div>
    <p>上一层 {strongest+1} 号 → 当前神经元 · 这里查看单条连线，节点仍使用全部 {row.length} 项输入计算。</p>
    <details><summary>展开全部 {row.length} 条输入权重</summary><div className={s.weightsTable}><table><thead><tr><th>来自</th><th>旧权重</th><th>变化</th><th>新权重</th></tr></thead><tbody>{row.map((w,i)=><tr key={i} data-selected={i===strongest}><td><button onClick={()=>setEdgeChoice(i)}>{i+1} 号</button></td><td>{fmt(w)}</td><td style={{color:newRow[i]-w>=0?'#7656a6':'#26867d'}}>{fmt(newRow[i]-w)}</td><td>{fmt(newRow[i])}</td></tr>)}</tbody></table></div></details>
    <details><summary>这个改变量怎样算出来？</summary><p>本轮初始梯度：{fmt(gradient)}。Adam 使用多个小批次的梯度更新，上方展示最终实际改变量，不能直接用这一个梯度乘学习率代替。</p></details>
    <p>偏置：{fmt(oldModel.layers[layer-1].bias[node])} → {fmt(newModel.layers[layer-1].bias[node])}</p>
   </>:<p>送入网络的标准化输入：<b>{fmt(sample.inputs[node])}</b>。输入表示环境状态，本身不是可训练权重。</p>}</section>
   <details><summary>PPO 为什么不会一下改太多？</summary><p>比较同一个动作在新旧策略下的概率。优势为正时鼓励提高它的概率，优势为负时倾向降低；概率比超出裁剪范围后，限制继续沿这个方向推动的收益。裁剪范围为 ±20%，不意味着每个权重只能改 20%。</p></details>
   <details><summary>这一轮的记录来自哪里？</summary><p>按原项目的网络结构和初始化方式，从随机初始化开始训练，共 {data.rounds.length} 轮。每轮采集 2048 步，使用原项目环境、128×128 策略网络、PPO 裁剪和 Adam 更新；独立价值网络也参与训练，本图完整展示策略网络。</p><p>显示的梯度是每轮开始时整批策略损失的梯度。实际更新经历 10 个 epoch、多个小批次，不等于把这一个梯度乘学习率。网页回放保存的计算结果，倍速加速回放，不会改写训练结果，这是一段新录制的从零训练早期过程，不是原成熟模型的训练历史。</p><p>种子 {data.source.seed} · SB3 {data.source.sb3}。训练后的策略不替换挑战页模型；这段记录不代表性能有所提升。</p></details>
  </aside></div>
  <footer>完整策略网络 · 17,408 个连接权重全部绘制，偏置在选中神经元后单独查看。播放完成后循环回放已有记录。方法参考 <a href="https://spinningup.openai.com/en/latest/algorithms/ppo.html">OpenAI Spinning Up：PPO</a>。</footer>
 </main>;
}
