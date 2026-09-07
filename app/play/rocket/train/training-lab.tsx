"use client";
import {useEffect,useMemo,useState} from 'react';
import {actions,forward,initialNetwork,learnBatch} from '../../../../lib/rocket/network-learning';
import s from './network.module.css';
const stages=['前向计算','环境前进','反向求梯度','更新与对照'];
const f=(x:number)=>x.toFixed(4),color=(x:number)=>x>=0?'#315e80':'#ad773b';
const pos=(l:number,i:number)=>({x:[80,300,530][l],y:l===0?105+i*80:70+i*75});
const edges=Array.from({length:28},(_,n)=>n<12?{id:Math.floor(n/3)*4+n%3,from:pos(0,n%3),to:pos(1,Math.floor(n/3)),label:`输入 ${n%3+1} → 隐藏 ${Math.floor(n/3)+1}`,layer:0,input:n%3}:{id:16+Math.floor((n-12)/4)*5+(n-12)%4,from:pos(1,(n-12)%4),to:pos(2,Math.floor((n-12)/4)),label:`隐藏 ${(n-12)%4+1} → ${Math.floor((n-12)/4)===3?'价值输出':`策略 ${Math.floor((n-12)/4)+1}`}`,layer:1,input:(n-12)%4});
export default function TrainingLab(){
 const [batch,setBatch]=useState(()=>learnBatch(initialNetwork(),17)),[round,setRound]=useState(1);
 const [stage,setStage]=useState(0),[playing,setPlaying]=useState(true),[index,setIndex]=useState(0),[edge,setEdge]=useState(0);
 const [motion,setMotion]=useState(0),[updated,setUpdated]=useState(false);
 useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const stop=()=>{if(query.matches)setPlaying(false);};stop();query.addEventListener('change',stop);return()=>query.removeEventListener('change',stop);},[]);
 const sample=batch.samples[index],selected=edges[edge];
 const before=useMemo(()=>forward(batch.before,sample.x),[batch,sample]),after=useMemo(()=>forward(batch.after,sample.x),[batch,sample]);
 const shown=stage===3&&updated?after:before;
 useEffect(()=>{if(!playing)return;let raf=0,last=0,acc=0;const tick=(now:number)=>{const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(!document.hidden){acc+=dt;setMotion(v=>(v+dt/3)%1);if(acc>=5){acc=0;setStage(v=>(v+1)%4);}}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[playing]);
 function selectStage(n:number){setStage(n);setPlaying(false);setMotion(0);}
 function nextBatch(){setBatch(learnBatch(batch.after,17+round));setRound(v=>v+1);setIndex(0);setStage(0);setUpdated(false);setMotion(0);}
 const gradient=batch.gradient[selected.id],old=batch.before[selected.id],next=batch.after[selected.id],input=selected.layer===0?sample.x[selected.input]:before.hidden[selected.input];
 const height=stage===1?sample.state.h+(sample.next.h-sample.state.h)*motion:sample.state.h;
 return <main className={s.page}>
  <nav><a href="/play/rocket">← 返回游戏</a><strong>网络怎样学习</strong><a href="/play/rocket/explain">怎样推理 →</a></nav>
  <header><div><small>02 / INSIDE LEARNING</small><h1>一次经历，怎样改变网络？</h1><p>看数据向前计算，再看梯度向后传递。最后，对照同一输入下的新旧决策。</p></div><span>教学 Actor–Critic<br/>3 输入 · 4 隐藏单元 · 策略与价值输出</span></header>
  <div className={s.toolbar}><button onClick={()=>setPlaying(!playing)}>{playing?'暂停讲解':'自动讲解'}</button><button onClick={()=>selectStage((stage+1)%4)}>下一步 →</button><span>第 {round} 批 · 4 次飞行 · {batch.samples.length} 条经历</span><button onClick={()=>{setBatch(learnBatch(initialNetwork(),17));setRound(1);setIndex(0);setUpdated(false);setStage(0);}}>重新开始</button></div>
  <div className={s.steps}>{stages.map((name,i)=><button key={name} aria-current={stage===i?'step':undefined} onClick={()=>selectStage(i)}><small>0{i+1}</small>{name}</button>)}</div>
  <div className={s.workspace}><section className={s.network}>
   <div className={s.networkHead}><b>{['状态进来，算出动作概率','权重不动，火箭状态改变','从训练目标向后计算梯度',updated?'权重已更新，重新前向计算':'梯度已算好，等待更新权重'][stage]}</b><span>连线：{stage===2?'梯度':stage===3?'权重调整量':'输入贡献'}</span></div>
   <div className={s.diagramScroll}><svg viewBox="0 0 670 365" role="group" aria-label="完整教学网络，点击连线查看计算">
    <text x="80" y="24" textAnchor="middle">3 个状态输入</text><text x="300" y="24" textAnchor="middle">4 个隐藏神经元</text><text x="530" y="24" textAnchor="middle">策略 / 价值</text>
    {edges.map((e,i)=>{const v=stage===2?batch.gradient[e.id]:stage===3?batch.after[e.id]-batch.before[e.id]:(e.layer===0?sample.x[e.input]:shown.hidden[e.input])*batch.before[e.id];const strength=Math.min(1,Math.abs(v)*(stage>=2?15:2)),local=Math.max(0,Math.min(1,motion*2-(stage===2?1-e.layer:e.layer))),travel=stage===2?1-local:local;return <g key={e.id} role="button" tabIndex={0} aria-label={e.label} aria-pressed={edge===i} onClick={()=>setEdge(i)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setEdge(i);}}}><line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke="transparent" strokeWidth="12"/><line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke={color(v)} strokeOpacity={edge===i?1:.15+strength*.7} strokeWidth={edge===i?3:1+strength*2}/>{playing&&(stage===0||stage===2)&&<circle cx={e.from.x+(e.to.x-e.from.x)*travel} cy={e.from.y+(e.to.y-e.from.y)*travel} r={edge===i?4:2} fill={color(v)} opacity={edge===i?1:.5}/>}</g>;})}
    {sample.x.map((v,i)=><g key={i}><circle cx="80" cy={pos(0,i).y} r="21" fill="#f3f7fa" stroke="#315e80"/><text x="80" y={pos(0,i).y+4} textAnchor="middle">{v.toFixed(2)}</text><text x="80" y={pos(0,i).y+37} textAnchor="middle">{['高度 ÷ 50','速度 ÷ 20','燃料 ÷ 5'][i]}</text></g>)}
    {shown.hidden.map((v,i)=><g key={i}><circle cx="300" cy={pos(1,i).y} r="22" fill={color(v)} fillOpacity={.1+Math.abs(v)*.35} stroke={color(v)}/><text x="300" y={pos(1,i).y+4} textAnchor="middle">{v.toFixed(2)}</text></g>)}
    {shown.outputs.map((v,i)=><g key={i}><circle cx="530" cy={pos(2,i).y} r="24" fill={i===3?'#f7efe5':'#edf3f7'} stroke={i===3?'#ad773b':'#315e80'}/><text x="530" y={pos(2,i).y+4} textAnchor="middle">{i===3?v.toFixed(2):Math.round(shown.prob[i]*100)+'%'}</text><text x="568" y={pos(2,i).y+4}>{i===3?'预期回报':`油门 ${actions[i]*100}%`}</text></g>)}
    <text x="300" y="350" textAnchor="middle">隐藏单元：乘系数 → 相加 → tanh 压缩</text>
   </svg></div>
   <div className={s.selection}><label>查看连接<select aria-label="查看连接" value={edge} onChange={e=>setEdge(Number(e.target.value))}>{edges.map((e,i)=><option key={e.id} value={i}>{e.label}</option>)}</select></label><p>蓝：正值 · 橙：负值 · 深浅表示绝对值。触屏可用下拉选择；网络图可横向移动。</p></div>
   <div className={s.timeline}><label>选择经历 <b>第 {sample.episode+1} 次飞行 · {sample.state.t.toFixed(2)} s</b><input type="range" aria-label="选择经历" min="0" max={batch.samples.length-1} value={index} onChange={e=>{setIndex(Number(e.target.value));setMotion(0);}}/></label><span>{index+1} / {batch.samples.length}</span></div>
   <div className={s.environment}><svg viewBox="0 0 100 110" aria-label="火箭高度变化" role="img"><path d="M5 96H95" stroke="#718498"/><g transform={`translate(50,${90-Math.min(120,height)/120*65})`}><path d="M-6 0V-18L0-28L6-18V0ZM-6-6L-12 2M6-6L12 2" fill="none" stroke="#315e80" strokeWidth="2"/>{sample.action>0&&<path d="M-3 2L0 10L3 2" fill="#ad773b"/>}</g></svg><div><b>动作送入物理环境</b><p>本次尝试油门 {actions[sample.action]*100}%</p><p>高度 {sample.state.h.toFixed(2)} → {sample.next.h.toFixed(2)} m<br/>速度 {sample.state.v.toFixed(2)} → {sample.next.v.toFixed(2)} m/s</p><small>推进 {(sample.next.t-sample.state.t).toFixed(2)} 秒；状态改变，权重保持不变。</small></div><div><small>本步奖励</small><strong>{sample.reward.toFixed(3)}</strong><small>随后折扣回报</small><strong>{sample.ret.toFixed(3)}</strong></div></div>
  </section><aside className={s.inspector}>
   <small>跟着所选经历 / {stages[stage]}</small><h2>{['它为什么选这个油门？','新状态从哪里来？','哪些系数需要怎样调整？','同一个输入，决策变了吗？'][stage]}</h2>
   {stage===0&&<><p>策略先算出三个分数，再用 softmax 换算成总和为 100% 的概率。按概率抽样得到实际动作；探索时不一定选择概率最大的一项。</p><div className={s.probabilities}>{before.prob.map((p,i)=><div key={i}><span>{actions[i]*100}% 油门</span><i style={{width:`${p*100}%`}}/><b>{(p*100).toFixed(1)}% {sample.action===i?'← 本次选中':''}</b></div>)}</div><p>价值输出 {f(before.value)}：网络对“从这个状态继续飞，后面能得到多少回报”的估计。</p></>}
   {stage===1&&<><p>油门影响推力，推力、重力和阻力共同改变速度，再改变高度。环境返回下一状态和奖励。</p><div className={s.formula}>新速度 = 旧速度 + 加速度 × 小步长<br/>新高度 = 旧高度 + 新速度 × 小步长</div><p>积分步长为 0.01 秒，每 0.1 秒选择动作。新状态进入下一次前向计算。</p><div className={s.formula}>保存：状态 → 动作 → 奖励 → 下一状态</div><p>收集本批 {batch.samples.length} 条经历时，使用的始终是同一组旧权重。</p></>}
   {stage===2&&<><p>用后续经历估计回报，再与原先预期比较。优势在更新前固定算好。</p><div className={s.formula}>优势 = 回报 − 原先预期<br/>{f(sample.ret)} − ({f(before.value)}) = <b>{f(sample.advantage)}</b></div><p>{sample.advantage>=0?'这次比预期好，策略目标倾向提高该动作的概率。':'这次比预期差，策略目标倾向降低该动作的概率。'}最终更新综合整批经历与价值误差，单个动作的概率不保证按这一条经历的方向变化。</p><p>梯度从输出向隐藏层计算。共享隐藏层同时收到策略和价值两部分梯度。</p></>}
   {stage===3&&<><p>保持当前输入不变，只替换权重。先预览差异，再执行更新。</p><div className={s.comparison}>{before.prob.map((p,i)=><div key={i}><span>{actions[i]*100}% 油门概率</span><b>{(p*100).toFixed(2)}% → {(after.prob[i]*100).toFixed(2)}%</b></div>)}</div><button className={s.primary} onClick={()=>setUpdated(true)} disabled={updated}>{updated?'本批更新已应用':'应用本批权重更新'}</button><button disabled={!updated} onClick={nextBatch}>用新网络收集下一批 →</button></>}
   <section className={s.calculation}><small>所选连接</small><h3>{selected.label}</h3><div className={s.formula}>{stage<2?<>输入 × 权重 = 本项贡献<br/>{f(input)} × ({f(old)}) = {f(input*old)}</>:<>新权重 = 旧权重 − 学习率 × 梯度<br/>{f(old)} − 0.03 × ({f(gradient)})<br/>= <b>{f(next)}</b></>}</div><p>{stage<2?'还会加上其他输入的贡献与偏置，再算出神经元输出。':'梯度来自整批经历的平均，不是单条经历的奖励。偏置也会更新。'}</p></section>
   <details><summary>梯度到底是什么意思？</summary><p>把一个系数稍微增大，训练目标会怎样变化？梯度描述这种变化趋势。“旧系数 − 学习率 × 梯度”让我们迈一小步；反向传播负责算梯度，更新才真正改系数。</p></details>
   <details><summary>专业公式与实现边界</summary><p>策略损失 = −优势 × ln(本次动作概率)；价值损失 = ½ × (预期回报 − 折扣回报)²。两者相加，对本批经历求平均，使用 SGD 更新。折扣率 0.99，学习率 0.03。</p><p>这是 Monte Carlo Actor–Critic 教学实现，不是 PPO：没有 PPO 概率比裁剪，也没有把物理环境当作可微网络反传。油门为 0%、50%、100%，随机初始化，不保证学会降落。图中 28 条连接，另有 8 个可训练偏置。</p><p>奖励：软着陆 +1，其他终止 −1，每 kg 燃料 −0.1，每秒 −0.02；最多飞行 20 秒。与原项目奖励不同。动画展示本机真实采样与计算的快照，不是原 PPO 训练历史。</p></details>
  </aside></div>
  <footer>参考 <a href="https://playground.tensorflow.org/">TensorFlow Playground</a> 的网络交互、<a href="https://d2l.ai/chapter_multilayer-perceptrons/backprop.html">《动手学深度学习》</a>的计算图，以及 <a href="https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html">Spinning Up</a> 的策略梯度讲解。自动讲解只切换阶段；点击应用更新与下一批才推进训练。刷新重置。</footer>
 </main>;
}
