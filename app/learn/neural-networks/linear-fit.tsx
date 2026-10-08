"use client";

import { useEffect, useRef, useState } from 'react';
import { FIT_RATE, FIT_SAMPLES, fitTrace, initialFit, predictValue, updateFit, type FitParameters } from '../../../lib/learning/linear-fit';
import s from './linear-fit.module.css';
import FeedbackMessage from './local-feedback';

const n = (v: number) => Math.abs(v) < .00001 ? '0' : Number(v.toFixed(4)).toString();
const px = (x: number) => 34 + x / 2.2 * 270;
const py = (y: number) => 187 - y / 7.5 * 158;
type Snapshot = { parameters: FitParameters; gradient: FitParameters; loss: number };

export default function LinearFit({ mode }: { mode: 'explore' | 'update' }) {
  const [parameters, setParameters] = useState(initialFit);
  const [attempt,setAttempt] = useState(0);
  const [selected, setSelected] = useState(2);
  const [term, setTerm] = useState<'w' | 'b'>('w');
  const [pending, setPending] = useState<Snapshot | null>(null);
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  const [steps, setSteps] = useState(0);
  const [acted, setActed] = useState(false);
  const [moving, setMoving] = useState(false);
  const frame = useRef<number | null>(null);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
  const trace = fitTrace(parameters, FIT_SAMPLES), row = trace.rows[selected], snapshot = pending ?? previous;
  const gradient = snapshot?.gradient[term];
  const gradientRows = snapshot ? fitTrace(snapshot.parameters,FIT_SAMPLES).rows : null;
  const sliceParameters = snapshot?.parameters ?? parameters;
  const sliceTrace = fitTrace(sliceParameters,FIT_SAMPLES);
  const slope = sliceTrace.gradient[term];
  const tinyParameters = {...sliceParameters,[term]:sliceParameters[term]+.01};
  const tinyLoss = fitTrace(tinyParameters,FIT_SAMPLES).loss;
  const lowerLoss = fitTrace({...sliceParameters,[term]:sliceParameters[term]-.01},FIT_SAMPLES).loss;
  const sx=(v:number)=>30+v/3*280,sy=(v:number)=>106-v/4*84;
  const lossPath=Array.from({length:61},(_,i)=>{const v=i/20;return `${i?'L':'M'}${sx(v)},${sy(fitTrace({...sliceParameters,[term]:v},FIT_SAMPLES).loss)}`;}).join(' ');
  const plotted = (p: FitParameters) => `M${px(0)},${py(predictValue(p,0))}L${px(2.2)},${py(predictValue(p,2.2))}`;
  function reset() { setAttempt(current=>current+1);if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;setMoving(false);setParameters(initialFit()); setSelected(2); setTerm('w'); setPending(null); setPrevious(null); setSteps(0); setActed(false); }
  function change(value: number) { if (!Number.isFinite(value)) return; setParameters(current => ({...current,[term]:Math.max(0,Math.min(term==='w'?2.5:2,value))})); setActed(true); }
  function compare(key: 'w' | 'b') {
    const start=initialFit(),before=fitTrace(start,FIT_SAMPLES),end={...start,[key]:2};
    setPrevious({parameters:start,gradient:before.gradient,loss:before.loss});setTerm(key);setActed(true);
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setParameters(end);return;}
    setParameters(start);setMoving(true);const began=performance.now();
    const draw=(now:number)=>{const t=Math.min(1,(now-began)/750);setParameters({...start,[key]:start[key]+(end[key]-start[key])*t});if(t<1)frame.current=requestAnimationFrame(draw);else{frame.current=null;setMoving(false);}};
    frame.current=requestAnimationFrame(draw);
  }
  function step() {
    if (steps>=30) return;
    if (!pending) { setPending({parameters:{...parameters},gradient:{...trace.gradient},loss:trace.loss}); setPrevious(null); }
    else { setParameters(updateFit(pending.parameters,pending.gradient,FIT_RATE)); setPrevious(pending); setPending(null); setSteps(current=>current+1); }
    setActed(true);
  }
  return <section className={s.block} data-linear-fit={mode} aria-label={mode==='explore'?'同一个神经元、公式与拟合直线':'从三个误差算出一次真实更新'}>
    <header><span>{mode==='explore'?'把一个神经元画成一条线':'用同一份旧参数，算梯度再更新'}</span><button onClick={reset}>重置本段</button></header>
    <p className={s.prompt}>{mode==='explore'?'先猜：只把 w 从 1 改成 2，x = 0 和 x = 2 的预测各增加多少？再点击验证，沿着计算路径看。':'初始有两个预测偏低、一个恰好正确。先计算梯度，判断该增大还是减小参数，再应用更新。'}</p>
    <div className={s.chain} data-fit-neuron>
      <span className={s.input}>输入 x<b>{row.x}</b></span>
      <button className={`${s.edge} ${term==='w'?s.active:''}`} aria-label="突出权重 w" aria-pressed={term==='w'} onClick={()=>setTerm('w')}><span>× w = {n(parameters.w)}</span><i aria-hidden="true"/><small>{row.x} × {n(parameters.w)} = {n(row.x*parameters.w)}</small></button>
      <button className={`${s.neuron} ${term==='b'?s.active:''}`} aria-label="突出偏置 b" aria-pressed={term==='b'} onClick={()=>setTerm('b')}><small>+ b = {n(parameters.b)}</small><span>{n(row.prediction)}</span></button>
      <span className={s.arrow} aria-hidden="true">→</span><span className={s.output}>输出 ŷ<b>{n(row.prediction)}</b></span>
    </div>
    <p className={s.identity}>这个线性单元直接输出加权和，使用恒等激活。</p>
    <div className={s.formula} data-fit-substitution><span>ŷ =</span><button aria-label="公式中的权重 w" aria-pressed={term==='w'} onClick={()=>setTerm('w')}>{n(parameters.w)}<small>w</small></button><span>× {row.x} +</span><button aria-label="公式中的偏置 b" aria-pressed={term==='b'} onClick={()=>setTerm('b')}>{n(parameters.b)}<small>b</small></button><span>= <b>{n(row.prediction)}</b></span></div>
    <div className={s.experiment}>
      <div className={s.controls} data-fit-controls>
        <div className={s.samples} role="group" aria-label="把哪个输入送进这个神经元">{FIT_SAMPLES.map((p,i)=><button key={p.x} aria-pressed={selected===i} onClick={()=>setSelected(i)}>x = {p.x}</button>)}</div>
        {mode==='explore'?<><div className={s.comparisons}><button disabled={moving} onClick={()=>compare('w')}>只改 w：1 → 2</button><button disabled={moving} onClick={()=>compare('b')}>只改 b：1 → 2</button></div><small className={s.startNote}>{moving?'正把这个参数从 1 变到 2，所有视图使用同一帧数值。':'每次比较都从 w = 1、b = 1 开始。'}</small><label className={s.parameter}><span>调整 {term} <small>{term==='w'?'权重 · 决定斜率':'偏置 · 决定截距'}</small></span><div><input type="range" disabled={!acted||moving} aria-label={`拟合${term}滑块`} min="0" max={term==='w'?2.5:2} step=".01" value={parameters[term]} onChange={e=>change(Number(e.target.value))}/><input type="number" disabled={!acted||moving} aria-label={`拟合${term}数值`} min="0" max={term==='w'?2.5:2} step=".01" value={Number(parameters[term].toFixed(3))} onChange={e=>change(e.target.valueAsNumber)}/></div></label><p className={s.cause}>{!acted?'先预测结果，再点上面的单独改变。注意空心预测点与真实记录之间的竖线。':term==='w'?<>当前 x = {row.x}：w 每增加 1，ŷ 就增加 <b>{row.x}</b>。{row.x===0?'因为 w × 0 始终是 0。':'同一条边乘的就是这个输入。'}</>:<>b 每增加 1，每个 x 的 ŷ 都增加 <b>1</b>，所以整条线一起上移。</>}</p></>:<><button className={s.primary} onClick={step} disabled={steps>=30}>{pending?'应用这次更新':'计算梯度'}</button><div className={s.gradient} data-fit-update><strong>{pending?'参数尚未改变':previous?`第 ${steps} 次更新已应用`:'先求梯度，参数暂不改变'}</strong>{snapshot&&<><span>∂L/∂{term} = ({gradientRows!.map(p=>term==='w'?`(${n(p.residual)})×${p.x}`:`(${n(p.residual)})`).join(' + ')}) / 3 = <b>{n(gradient!)}</b>{previous&&'（更新前）'}</span><span>{gradient!<0?`梯度为负：这次增大 ${term}。`:gradient!>0?`梯度为正：这次减小 ${term}。`:'这个方向的梯度为 0。'}</span><span>同一次更新同时改变 w 和 b：</span>{(['w','b'] as const).map(key=><span key={key}>{key}新 = {n(snapshot.parameters[key])} − 0.3 × ({n(snapshot.gradient[key])}) = <b>{n(snapshot.parameters[key]-FIT_RATE*snapshot.gradient[key])}</b></span>)}</>}{previous&&<span className={s.lossChange}>平均损失：{n(previous.loss)} → <b>{n(trace.loss)}</b></span>}</div></>}
        <div className={s.result} data-fit-result><span>所选输入 x = {row.x} · 真实值 y = {row.y}</span><strong>误差 e = ŷ − y = {n(row.prediction)} − {row.y} = {n(row.residual)}</strong><span>图中的竖线连接这个预测与真实值。{row.residual<0?'预测偏低。':row.residual>0?'预测偏高。':'这个点恰好预测正确。'}</span><span>这个点的损失 ℓ = ({n(row.residual)})² / 2 = <b>{n(row.sampleLoss)}</b></span><span>L = ({trace.rows.map(p=>n(p.sampleLoss)).join(' + ')}) / 3 = <b>{n(trace.loss)}</b>（半均方误差）</span></div>
      </div>
      <figure className={s.figure} data-fit-plot><svg viewBox="0 0 340 224" role="img" aria-label={`当前预测线 y帽等于${n(parameters.w)}x加${n(parameters.b)}。所选输入${row.x}的预测${n(row.prediction)}，真实值${row.y}，误差${n(row.residual)}`}>
        {[0,1,2,3,4,5,6,7].map(y=><g key={y}><path d={`M${px(0)} ${py(y)}H${px(2.2)}`} stroke="#e0e5eb"/><text x="26" y={py(y)+4} textAnchor="end">{y}</text></g>)}
        {[0,1,2].map(x=><g key={x}><path d={`M${px(x)} ${py(0)}V${py(7.5)}`} stroke="#e0e5eb"/><text x={px(x)} y="207" textAnchor="middle">{x}</text></g>)}
        <path d={`M${px(0)} ${py(7.5)}V${py(0)}H${px(2.2)}`} stroke="#8796aa" fill="none"/><text x="12" y="15">y / ŷ</text><text x="316" y="191">x</text>
        {previous&&<path d={plotted(previous.parameters)} fill="none" stroke="#8f9cab" strokeWidth="1.3" strokeDasharray="4 4"/>}
        {term==='w'?<g data-slope-indicator><path d={`M${px(0)} ${py(parameters.b)}H${px(1)}V${py(parameters.b+parameters.w)}`} stroke="#8796aa" strokeDasharray="2 3" fill="none"/><text x={px(.5)} y={py(parameters.b)+14} textAnchor="middle">Δx = 1</text><text x={px(1)+6} y={py(parameters.b+parameters.w/2)}>Δŷ = {n(parameters.w)}</text></g>:<g data-intercept-indicator><circle cx={px(0)} cy={py(parameters.b)} r="10" fill="none" stroke="#416582" strokeWidth="1.4"/><text x={px(0)+13} y={py(parameters.b)-8}>截距 b = {n(parameters.b)}</text></g>}
        <path d={plotted(parameters)} stroke="#416582" strokeWidth="2" fill="none"/>
        {trace.rows.map((p,i)=><g key={p.x} opacity={i===selected?1:.55}><path d={`M${px(p.x)} ${py(p.prediction)}V${py(p.y)}`} stroke={p.residual<0?'#91612d':'#416582'} strokeWidth={i===selected?2:1} strokeDasharray={i===selected?undefined:'3 3'}/><circle cx={px(p.x)} cy={py(p.y)} r={i===selected?5.5:4} fill="#263241" stroke="#fcfcfd" strokeWidth="1.3"/><circle cx={px(p.x)} cy={py(p.prediction)} r={i===selected?6:4.5} fill="#fcfcfd" stroke="#416582" strokeWidth="1.8"/>{Math.abs(p.residual)<1e-10&&<circle cx={px(p.x)} cy={py(p.y)} r="2.3" fill="#263241"/>}</g>)}
        <text x={px(row.x)+(row.x===2?-10:10)} textAnchor={row.x===2?'end':'start'} y={py(row.prediction)+4} className={s.predictionLabel}>ŷ {n(row.prediction)}</text>
      </svg><figcaption><FeedbackMessage observation={{attempt,model:JSON.stringify(parameters),sample:String(selected),prediction:null,goal:trace.loss===0}} summary={`所选 x = ${row.x}：预测 ${n(row.prediction)}，真实 ${row.y}。`} goalText="当前 3 个样本恰好全部拟合。3 / 3"/>● 真实记录 · ○ 这个神经元的预测<br/>整条线：把不同 x 逐个送进同一个单元。{previous&&<><br/>{mode==='explore'?'虚线：本次比较的起始线。':'虚线：更新前的预测线。'}</>}</figcaption></figure>
    </div>
    {mode==='explore'?<p className={s.observation}>{acted&&trace.loss===0?'✓ 当前三个样本恰好全部拟合。试着切换 x，检查同一个公式。':'换成 x = 0 再改 w，为什么预测不动？再改 b，对比两者。'}</p>:<div className={s.lossMath} data-fit-loss><div className={s.lossSlice}><div><strong>变化率，就是这条损失曲线在当前点的斜率。</strong><p>这里只让 {term} 变化，{term==='w'?'b':'w'} 固定为 {n(sliceParameters[term==='w'?'b':'w'])}{snapshot?'（更新前）':''}。这张图的横轴是参数，不是输入 x。</p><p>在当前 {term} 左右各取 0.01：两侧损失分别为 {lowerLoss.toFixed(6)}、{tinyLoss.toFixed(6)}。对称比较变化率 = (右侧损失 − 左侧损失) / 0.02 ≈ {((tinyLoss-lowerLoss)/.02).toFixed(4)}，对应当前导数 {n(slope)}。</p></div><svg viewBox="0 0 340 134" role="img" aria-label={`固定另一个参数时，损失随${term}变化的曲线；当前位置斜率${n(slope)}`}><path d="M30 20V106H316" stroke="#8796aa" fill="none"/><path d={lossPath} stroke="#416582" strokeWidth="1.8" fill="none"/><path d={`M${sx(sliceParameters[term]-.25)} ${sy(sliceTrace.loss-.25*slope)}L${sx(sliceParameters[term]+.25)} ${sy(sliceTrace.loss+.25*slope)}`} stroke="#91612d" strokeWidth="1.6"/><circle cx={sx(sliceParameters[term])} cy={sy(sliceTrace.loss)} r="4" fill="#416582"/><text x="8" y="16">L</text><text x="330" y="123">{term}</text>{[0,1,2,3].map(value=><text key={value} x={sx(value)} y="123" textAnchor="middle">{value}</text>)}<text x="19" y="26">4</text><text x="300" y="20" textAnchor="end">切线斜率 {n(slope)}</text></svg></div><p>同一个模型，三个输入分别计算：</p><div>{trace.rows.map(p=><p key={p.x}>x = {p.x}：ŷ = {n(parameters.w)} × {p.x} + {n(parameters.b)} = {n(p.prediction)}；e = <b>{n(p.residual)}</b></p>)}</div><p>L = ({trace.rows.map(p=>`(${n(p.residual)})²`).join(' + ')}) / (2 × 3) = <b>{n(trace.loss)}</b></p><details><summary>把误差接到梯度：为什么要乘输入 x？</summary><p>这里统一用 L = Σ(ŷ − y)² / (2N)。前面的 1/2 让求导更简洁，不改变最优拟合线。单点损失 ℓ 对该点预测的导数是 e；平均损失再除以 N。w 对预测的影响是 x，b 对预测的影响是 1。</p><p>∂L/∂w = Σ(e × x) / N<br/>∂L/∂b = Σe / N</p><p>{snapshot?<>当前展示的梯度使用<b>更新前</b>的参数 w = {n(snapshot.parameters.w)}、b = {n(snapshot.parameters.b)}。三个误差是 {fitTrace(snapshot.parameters,FIT_SAMPLES).rows.map(p=>n(p.residual)).join('、')}。</>:'计算梯度后，这里会标明它使用的旧参数与误差。'}</p><p>学习率固定为 0.3，w 和 b 从同一份旧参数同时更新。更大的步长不保证损失下降；更新平均损失，也不保证每个点都变好。上限为 30 次。</p></details></div>}
  </section>;
}
