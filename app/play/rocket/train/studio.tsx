"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadPPORecord, traceNormalized, type PPORecord } from '../../../../lib/rocket/ppo-record';
import StudioNetwork from './studio-network';
import UpdatePlayground from './update-playground';
import RocketTutor, {type TutorSnapshot} from '../explain/rocket-tutor';
import { cellBlend, dependencies, heat, playback, revealFor, type Cell } from './studio-model';
import s from './studio.module.css';
import lesson from '../explain/lesson.module.css';

const names=['第一隐藏层','第二隐藏层','输出层'];
const number=(v:number)=>v!==0&&Math.abs(v)<.0001?v.toExponential(2):v.toFixed(4);
export default function TrainingStudio() {
  const [data,setData]=useState<PPORecord|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{const controller=new AbortController();loadPPORecord('/rocket/ppo-initialization.json',controller.signal).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[attempt]);
  if(!data)return <main className={s.studio}><h1>看见网络怎样学习</h1><p role="status">{error||'正在读取 50 轮真实训练记录…'}</p>{error&&<button onClick={()=>{setError('');setAttempt(v=>v+1);}}>重新加载</button>}</main>;
  return <Studio data={data}/>;
}
function Studio({data}:{data:PPORecord}) {
  const [time,setTime]=useState(0),[speed,setSpeed]=useState(8),[playing,setPlaying]=useState(()=>typeof window==='undefined'||!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [selected,setSelected]=useState<Cell>({layer:1,row:63,col:63}),[sampleIndex,setSampleIndex]=useState(0);
  const [focused,setFocused]=useState(false),[lossSelected,setLossSelected]=useState(false);
  const [askSnapshot,setAskSnapshot]=useState<TutorSnapshot|null>(null);
  const elapsed=useRef(0),initialHold=useRef(.8),duration=data.rounds.length*12;
  useEffect(()=>{if(!playing)return;let id=0,last=0;const tick=(now:number)=>{const dt=last?Math.min(.06,(now-last)/1000):0;last=now;if(!document.hidden){if(initialHold.current>0)initialHold.current-=dt;else{const value=elapsed.current+dt*speed;elapsed.current=value>=duration?0:value;if(value>=duration)initialHold.current=.8;setTime(elapsed.current);}}id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);},[playing,speed,duration]);
  const state=playback(time,data.rounds.length),round=data.rounds[state.round],before=data.models[state.round],after=data.models[state.round+1],sample=round.samples[Math.min(sampleIndex,round.samples.length-1)];
  const trace=useMemo(()=>traceNormalized(before,sample.inputs),[before,sample]);
  const signals=useMemo(()=>sample.neuronGradient.map((row,l)=>row.map((g,j)=>g*(l===2?1:1-trace.activations[l][j]**2))),[sample,trace]);
  const limit=useMemo(()=>{const values=data.models.slice(1).flatMap(m=>m.layers.flatMap((l,k)=>l.weight.flatMap((row,j)=>row.map((w,i)=>Math.abs(w-data.models[0].layers[k].weight[j][i]))))).sort((a,b)=>a-b);return values[Math.floor(values.length*.99)]||.01;},[data]);
  const {layer,row,col}=selected,old=before.layers[layer].weight[row][col],next=after.layers[layer].weight[row][col],delta=next-old;
  const input=layer===0?sample.inputs[col]:trace.activations[layer-1][col];
  const activationFactor=layer===2?1:1-trace.activations[layer][row]**2;
  const neuronGradient=sample.neuronGradient[layer][row];
  const sampleGradient=neuronGradient*activationFactor*input;
  const sources=dependencies(selected);
  const terms=sources.map(source=>{
    const downstream=source.layer,k=source.row;
    const factor=downstream===2?1:1-trace.activations[downstream][k]**2;
    return sample.neuronGradient[downstream][k]*factor*before.layers[downstream].weight[k][source.col];
  });
  const strongest=terms.reduce((best,v,i)=>Math.abs(v)>Math.abs(terms[best]??0)?i:best,0),source=sources[strongest];
  const blend=cellBlend(selected,revealFor(layer,state.phase,state.part));
  const lensRows=layer===2?1:3,lensCols=5,rowStart=layer===2?0:Math.max(0,Math.min(125,row-1)),colStart=Math.max(0,Math.min((layer===0?7:128)-5,col-2));
  const tutorSnapshot:TutorSnapshot={time,timeLabel:`第 ${state.round+1} 轮 · ${['前向计算','反向传播','权重更新'][state.phase]}`,selection:lossSelected?'飞行反馈 / 策略损失':`${names[layer]} · 权重 [${row+1}, ${col+1}]`,context:JSON.stringify({experiment:'PPO training replay',model:'7-128-128-1',round:state.round+1,totalRounds:data.rounds.length,phase:['forward','backward','update'][state.phase],playbackOnly:true,selection:lossSelected?{kind:'policyLoss'}:{kind:'weight',layer:layer+1,row:row+1,col:col+1},policyLoss:round.policyLoss,steps:round.steps,sample:{index:sample.index,inputs:sample.inputs,action:sample.action,advantage:sample.advantage,return:sample.return},weight:lossSelected?null:{before:old,after:next,change:delta,displayed:old+delta*blend,batchInitialGradient:round.gradient[layer].weight[row][col],sampleGradient,neuronGradient,activationFactor,forwardInput:input,downstreamTerms:terms},training:data.config,source:data.source,explanation:'连线显示反传贡献，非最终 Adam 改变量分摊。扫描仅为教学演示；没有完整飞行轨迹或成功率数据。'})};
  function seek(value:number){elapsed.current=Math.max(0,Math.min(duration,value));initialHold.current=0;setTime(elapsed.current);setPlaying(false);}
  function select(cell:Cell){setSelected(cell);setFocused(true);setLossSelected(false);}
  return <main className={s.studio} data-training-studio>
    <header className={s.heading}><div><span className={s.eyebrow}>LEARNING / 03</span><h1>一次反馈，怎样改变网络。</h1></div><p>50 轮真实 PPO 记录<span>7 → 128 → 128 → 1</span></p></header>
    <UpdatePlayground/>
    <div className={s.workspace}>
      <section className={s.visual} aria-label="训练网络与播放控制">
        <div className={s.stageBar}>{['前向 · 算出动作','反馈 · 传回梯度','更新 · 调整权重'].map((label,i)=><span key={label} data-active={state.phase===i}><i>{`0${i+1}`}</i>{label}</span>)}</div>
        <div className={s.diagramHint}><span>{lossSelected?'全网反馈 · 从损失端逐层传回':focused?'聚焦所选权重 · 弱分支不绘制':'保留主要反传路径 · 低贡献连线已隐藏'}</span>{focused?<button onClick={()=>{setFocused(false);setLossSelected(false);}}>取消聚焦</button>:<button onClick={()=>setFocused(true)}>聚焦当前格</button>}</div>
        <StudioNetwork initial={data.models[0]} before={before} after={after} inputs={sample.inputs} selected={selected} focused={focused&&!lossSelected} lossSelected={lossSelected} onLossSelect={()=>{setLossSelected(true);setFocused(true);}} phase={state.phase} part={state.part} activeLayer={state.layer} limit={limit} terms={terms} signals={signals} activations={trace.activations} onSelect={select}/>
        <div className={s.legend}><span>热图：权重变化</span><span>减少</span><i/><span>增加</span><small>连线：蓝正 / 棕负 · 隐藏低于本组最大贡献 18% 的线</small></div>
        <div className={s.transport}>
          <div className={s.timeHeading}><strong>第 {state.round+1}<small> / {data.rounds.length} 轮</small></strong><span>{['用当前权重做决定','沿选中权重追踪反馈','从左向右展开本轮更新'][state.phase]}</span></div>
          <div className={lesson.playbackLine}><button onClick={()=>setPlaying(v=>!v)} aria-label={playing?'暂停播放':'继续播放'}>{playing?'暂停':'继续'}</button><input aria-label="训练轮次" type="range" min="0" max={duration} step="any" value={time} onChange={e=>seek(Number(e.target.value))}/><select aria-label="播放速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.25,1,2,8,16,32,64].map(v=><option value={v} key={v}>{v}×</option>)}</select></div>
          <div className={s.transportFoot}><div><button onClick={()=>{setSpeed(32);setPlaying(true);}}>快速总览</button><button onClick={()=>{setSpeed(1);setPlaying(true);}}>慢速细看</button></div><div><button aria-label="上一轮" onClick={()=>seek((state.round-1)*12)}>←</button><button aria-label="下一轮" onClick={()=>seek((state.round+1)*12)}>→</button><button onClick={()=>seek(0)}>重播</button></div></div>
        </div>
        <div className={s.pickers}><label>查看层<select aria-label="选择网络层" value={layer} onChange={e=>select({layer:Number(e.target.value),row:Number(e.target.value)===2?0:63,col:Number(e.target.value)===0?3:63})}>{names.map((name,i)=><option key={name} value={i}>{name}</option>)}</select></label><label>神经元<select aria-label="选择神经元编号" value={row} onChange={e=>select({...selected,row:Number(e.target.value)})}>{Array.from({length:layer===2?1:128},(_,i)=><option key={i} value={i}>{i+1} 号</option>)}</select></label><label>输入连线<select aria-label="选择权重连线" value={col} onChange={e=>select({...selected,col:Number(e.target.value)})}>{Array.from({length:layer===0?7:128},(_,i)=><option key={i} value={i}>{i+1} 号</option>)}</select></label></div>
      </section>
      <aside className={s.inspector}>
        {lossSelected?<section className={s.lossInspector}>
         <span className={s.eyebrow}>全网反馈</span><h2>损失怎样传回网络</h2>
         <div className={s.weightHero}><span>本轮初始策略损失</span><strong>{number(round.policyLoss)}</strong><small>真实训练记录 · 不是飞行总得分</small></div>
         <details className={s.details}><summary>逐层查看反馈路径</summary><ol><li data-active={state.layer===2}><b>输出端</b><p>先计算改变策略输出，会怎样影响损失。</p></li><li data-active={state.layer===1}><b>第二隐藏层</b><p>沿输出连接传回，再乘本层激活函数的变化系数。</p></li><li data-active={state.layer===0}><b>第一隐藏层</b><p>汇总后层传回的各项贡献，结合前向输入得到权重梯度。</p></li></ol></details>
         <details className={s.details}><summary>连线显示规则</summary><p>深色线表示当前样本中较大的反传贡献。全网概览每层最多显示 64 条主路径，低于最大贡献 18% 的线省略。所有权重仍参与计算。</p></details>
         <button onClick={()=>{setLossSelected(false);setFocused(true);}}>回到所选权重</button>
        </section>:<>
        <div className={s.inspectHeading}><span className={s.eyebrow}>当前权重</span><h2>看清这一格</h2><p>{names[layer]} · 权重 [{row+1}, {col+1}]</p></div>
        <div className={s.weightHero}><span>这一轮的变化</span><strong data-weight-value>{number(old+delta*blend)}</strong><div className={s.change}><span>{number(old)}</span><span>→</span><span>{number(next)}</span></div><small>{blend===0?'扫描前':blend===1?'扫描后':'正在更新'} · 实际改变量 <b>{delta>=0?'+':''}{number(delta)}</b></small></div>
        <details className={s.lens}><summary>局部放大 · 可点选相邻权重</summary><div style={{gridTemplateColumns:`repeat(${lensCols},1fr)`}}>{Array.from({length:lensRows*lensCols},(_,n)=>{const r=rowStart+Math.floor(n/lensCols),c=colStart+n%lensCols,cell={layer,row:r,col:c},t=cellBlend(cell,revealFor(layer,state.phase,state.part)),w=before.layers[layer].weight[r][c]+(after.layers[layer].weight[r][c]-before.layers[layer].weight[r][c])*t,change=w-data.models[0].layers[layer].weight[r][c];return <button key={`${r}-${c}`} data-lens-selected={r===row&&c===col} style={{background:heat(change,limit)}} aria-label={`选择权重 ${r+1} 行 ${c+1} 列`} onClick={()=>select(cell)}><span>{r+1},{c+1}</span></button>;})}</div></details>
        <details className={s.details}><summary>查看反馈与梯度计算</summary><p>{source?layer===1?`输出权重 [1, ${source.col+1}] 把反馈传来，图中继续展开它经过所选连接传向前层的分支。`:`后层第 ${row+1} 列的 128 条路径共同传回反馈。每条相关线都按当前样本的反传贡献绝对值显示深浅。`:'飞行反馈形成策略损失，再求出输出对损失的影响。'}</p>{source&&<div className={s.pathCaption}>W{source.layer+1}[{source.row+1}, {source.col+1}]<span>→</span>W{layer+1}[{row+1}, {col+1}]</div>}
        <section className={s.explanation}><p>反馈 × 本层的变化系数 × 前向输入</p><div className={s.equation}><span>{number(neuronGradient)} × {number(activationFactor)} × {number(input)}</span><strong>= {number(sampleGradient)}</strong></div><small>这是当前样本对该权重梯度的贡献。</small></section>
        <details className={s.details}><summary>梯度怎样变成实际改变量？</summary><p>所有样本的贡献相加得到整批梯度。记录中的本轮初始梯度为 {number(round.gradient[layer].weight[row][col])}。Adam 经过多个小批次更新，上面的旧值和新值是本轮真实端点，不能用这个初始梯度直接乘学习率代替。</p></details></details>
        </>}
        <details className={s.details}><summary>训练样本与反馈</summary><div className={s.sample}><label>当前记录样本<select aria-label="训练样本" value={Math.min(sampleIndex,round.samples.length-1)} onChange={e=>setSampleIndex(Number(e.target.value))}>{round.samples.map((v,i)=><option key={i} value={i}>采样步 {v.index+1}</option>)}</select></label><div><span>相对预期的表现</span><b>{sample.advantage>=0?'+':''}{sample.advantage.toFixed(2)}</b></div><small>正值鼓励这个动作，负值降低倾向；不是本次飞行的总得分。</small></div></details>

        <div className={s.tutorPanel}><RocketTutor mode="training" snapshot={askSnapshot??tutorSnapshot} locked={!!askSnapshot} onLock={()=>setAskSnapshot(tutorSnapshot)} onFollow={()=>setAskSnapshot(null)}/></div>
      </aside>
    </div>

    <footer className={s.footer}><details><summary>真实记录与教学回放说明</summary><p>全图保留 17,408 个连接权重。色彩经过平滑显示，准确值以选中格为准；逐格扫描与流动线是解释顺序，不是优化器的实际执行顺序。输入为标准化数值，权重初始化并不相等。</p><p>从初始化开始的 {data.rounds.length} 轮 PPO 训练，每轮 {round.steps.toLocaleString()} 个采样步，种子 {data.source.seed}。策略网络完整展示；独立价值网络参与训练但未画在此图。网页循环播放保存的记录，不在浏览器内训练，也不保证这段早期记录已经学会降落。</p></details></footer>
  </main>;
}
