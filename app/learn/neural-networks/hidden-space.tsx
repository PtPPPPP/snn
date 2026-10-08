"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CLASSIFIER_PLANE, OBLIQUE, TOP, XOR_CORNERS, classify, features, initialReveal, orbit, outputScore, presentation, project, revealPosition, updateReveal, type Camera, type Vec3 } from '../../../lib/learning/hidden-space';
import s from './hidden-space.module.css';
import FeedbackMessage from './local-feedback';

const ink = ['#91612d', '#416582'];
const decimal = (v: number) => Number(v.toFixed(2)).toString();
const coordinates = (v: Vec3) => `(${v.map(decimal).join(', ')})`;

export default function HiddenSpace() {
  const [reveal, setReveal] = useState(initialReveal);
  const [attempt,setAttempt] = useState(0);
  const [camera, setCamera] = useState<Camera>({ ...OBLIQUE });
  const [selected, setSelected] = useState(3);
  const drag = useRef<{ id: number; x: number; y: number; touch: boolean } | null>(null);
  const stage = presentation(reveal.t, reveal.planeRequested);
  const point = XOR_CORNERS[selected], h = features(point.input), displayed = revealPosition(h, reveal.t);
  const projected = (v: Vec3) => project(v, camera);
  const path = (vertices: readonly Vec3[]) => vertices.map((v, i) => { const p = projected(v); return `${i ? 'L' : 'M'}${p.x},${p.y}`; }).join(' ');
  function pointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: PointerEvent<SVGSVGElement>) {
    const previous = drag.current;
    if (!previous || previous.id !== e.pointerId) return;
    setCamera(current => orbit(current, (e.clientX - previous.x) * .009, previous.touch ? 0 : (e.clientY - previous.y) * .007));
    drag.current = { ...previous, x: e.clientX, y: e.clientY };
  }
  function release(e: PointerEvent<SVGSVGElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function keyboard(e: KeyboardEvent<SVGSVGElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') setCamera({ ...OBLIQUE });
    else setCamera(current => orbit(current, e.key === 'ArrowLeft' ? -.12 : e.key === 'ArrowRight' ? .12 : 0, e.key === 'ArrowUp' ? -.1 : e.key === 'ArrowDown' ? .1 : 0));
  }
  const message = stage.planeVisible ? '这四个点，已经被一个平面分开。' : stage.complete ? '三个特征已展开。打开分类平面，看看它怎样分开四点。' : reveal.t === 0 ? '先看原来的四个角点：这条尝试的直线分对 3 / 4。' : '正在展开第三个特征。这只是显示过程，暂不判断中间位置。';
  return <section className={s.block} data-hidden-space aria-label="四个角点的三维隐藏表示">
    <header><span>换一种表示，试着分开四个角点</span><button onClick={() => { setAttempt(current=>current+1);setReveal(initialReveal()); setCamera({ ...OBLIQUE }); setSelected(3); }}>重新看一遍</button></header>
    <p className={s.intro}>这是一个单独的手设网络：2 个输入 → 3 个 ReLU 特征。先向右拖动滑块，看右上角怎样升起来。</p>
    <div className={s.experiment}>
      <figure className={s.figure} data-hidden-space-visual>
        <svg viewBox="0 0 340 278" role="group" tabIndex={0} aria-label="可旋转的三维特征图。左右方向键旋转，上下方向键调整视角，Home 恢复斜视。手机横向拖动旋转，纵向滑动阅读。" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={keyboard}>
          <path d={path([[0,0,0],[1,0,0],[1,1,0],[0,1,0]])+'Z'} fill="#f0f2f5" stroke="#c7cfd9"/>
          {[.25,.5,.75].map(t => <path key={t} d={`${path([[t,0,0],[t,1,0]])} ${path([[0,t,0],[1,t,0]])}`} stroke="#dfe4e9" fill="none"/>)}
          <path d={path([[1,0,0],[0,1,0]])} stroke="#8796aa" strokeDasharray="4 4" fill="none"/>
          {stage.attemptedLineVisible && <path d={path([[.5,0,0],[0,.5,0]])} stroke="#505b6b" strokeWidth="2" fill="none"/>}
          {[0,1,2].map(axis => {
            const end: [number,number,number] = [0,0,0]; end[axis] = 1.17;
            const label = projected(end), tick: [number,number,number] = [0,0,0]; tick[axis]=1; const p=projected(tick);
            return <g key={axis}><path d={path([[0,0,0],end])} stroke="#8796aa" fill="none"/><circle cx={p.x} cy={p.y} r="2" fill="#606b7b"/><text x={label.x} y={label.y+(axis===2?-7:15)} textAnchor="middle" className={s.axisLabel}>{axis===0?'h₁':axis===1?'h₂':stage.complete?'h₃':'t·h₃'}</text><text x={p.x+(axis===2?-12:0)} y={p.y+(axis===2?4:16)} textAnchor="middle" className={s.tick}>1</text></g>;
          })}
          {stage.planeVisible && <path data-classifier-plane d={path(CLASSIFIER_PLANE)+'Z'} fill="#8da5b8" fillOpacity=".24" stroke="#416582" strokeWidth="1.4"/>}
          {reveal.t>0 && <path d={path([[1,1,0],[1,1,reveal.t]])} stroke="#91612d" strokeDasharray="3 4" fill="none"/>}
          {XOR_CORNERS.map((p,i)=>{
            const pos=projected(revealPosition(features(p.input),reveal.t));
            return <g key={p.id}><title>{`输入 ${p.id}，真实类别 ${p.target}；完整特征 ${coordinates(features(p.input))}`}</title>{selected===i&&<circle cx={pos.x} cy={pos.y} r="12" fill="none" stroke="#202630" strokeWidth="1.3"/>}{p.target===1?<circle cx={pos.x} cy={pos.y} r="6.5" fill={ink[1]} stroke="#fcfcfd" strokeWidth="1.5"/>:<rect x={pos.x-6} y={pos.y-6} width="12" height="12" rx="1" fill={ink[0]} stroke="#fcfcfd" strokeWidth="1.5"/>}<text x={pos.x+(p.id==='11'?15:-15)} y={pos.y-10} textAnchor={p.id==='11'?'start':'end'} className={s.pointLabel}>{p.id}</text>{stage.attemptedLineVisible&&p.id==='11'&&<text x={pos.x+15} y={pos.y+13} className={s.errorLabel}>错分</text>}</g>;
          })}
        </svg>
        <figcaption><FeedbackMessage observation={{attempt,model:`${reveal.t}:${reveal.planeRequested}`,sample:String(selected),prediction:null,goal:stage.planeVisible}} summary={stage.complete?'完整特征已展开；分类平面可显示或隐藏。':'逐步展开既定特征，参数没有改变。'} goalText="三维构造已展开：这四点被平面分开。4 / 4"/>■ 类别 0 · ● 类别 1；颜色和形状始终是真实类别。<br/>底面虚线：x + y = 1 的折痕。横拖旋转，竖滑阅读。</figcaption>
      </figure>
      <div className={s.controls} data-hidden-space-controls>
        <label className={s.reveal}><span>展开第 3 个特征 <output>{Math.round(reveal.t*100)}%</output></span><input type="range" min="0" max="100" step="1" value={Math.round(reveal.t*100)} aria-label="展开第三个特征" aria-valuetext={`${Math.round(reveal.t*100)}%，显示高度是 t 乘 h3，不是训练`} onChange={e=>{const t=Number(e.target.value)/100;setReveal(current=>updateReveal(current,{t}));}}/></label>
        <div className={s.tools}><button disabled={!stage.complete} aria-pressed={stage.planeVisible} onClick={()=>setReveal(current=>updateReveal(current,{planeRequested:!current.planeRequested}))}>{stage.planeVisible?'隐藏分类平面':'显示分类平面'}</button><button onClick={()=>setCamera({...OBLIQUE})}>斜视</button><button onClick={()=>setCamera({...TOP})}>俯视</button></div>
        <p className={s.hint}>{reveal.t===0?'先向右展开；初始实线是 x + y = 0.5。':!stage.complete?'展开到 100% 后，才显示分类平面与预测。':camera.pitch===Math.PI/2?'俯视把高度压平了；切回斜视可看见第三个特征。':'平面：h₁ + h₂ − 2h₃ = 0.5。旋转只改变观察角度。'}</p>
        <div className={`${s.feedback} ${stage.planeVisible?s.solved:''}`} data-completion-count={reveal.completionCount}><span aria-hidden="true">{stage.planeVisible?'✓':'↳'}</span><p>{message}</p></div>
        <div className={s.readout} data-hidden-space-result><label>观察角点<select aria-label="观察三维角点" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{XOR_CORNERS.map((p,i)=><option key={p.id} value={i}>({p.input.join(', ')}) · 真实类别 {p.target}</option>)}</select></label><p>显示坐标 <b>{coordinates(displayed)}</b></p>{stage.predictionsVisible?<p data-endpoint-prediction>得分 s = <b>{outputScore(h)}</b> · 预测类别 <b>{classify(h)}</b> · 分对</p>:<p>完整特征 h = {coordinates(h)}<br/>当前显示高度 t·h₃，参数没有改变。</p>}</div>
      </div>
    </div>
    <details className={s.details}><summary>这三个特征具体怎样计算？</summary><p>ReLU(z) = max(0, z)。输入范围是 [0,1]²，所以前两个特征直接保留输入；只有右上角的第三个特征为 1。</p><p className={s.formula}>h₁ = ReLU(x)<br/>h₂ = ReLU(y)<br/>h₃ = ReLU(x + y − 1)</p><p>四个角点依次得到 (0,0,0)、(1,0,0)、(0,1,0)、(1,1,1)。输出得分 s = h₁ + h₂ − 2h₃ 分别是 0、1、1、0；s &gt; 0.5 判为类别 1。得分不是概率。</p><p>这是真正由三个隐藏单元构成的三维表示。权重由我们手工设定，没有训练；滑块只是逐步展示既定的第三坐标，也不是把原来四隐藏单元网络截取三维。</p><p>“折纸”只是直觉，不表示物理纸张，也不说明 XOR 必须用三个隐藏单元。图中的点始终画在平面上层，便于观察。</p></details>
  </section>;
}
