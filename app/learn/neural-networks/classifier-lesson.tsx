"use client";
import {useState} from 'react';
import {FRONT,boundaryFor,boundarySegment,cameraProject,caseData,classify,clippedRegion,type Boundary,type CaseId} from '../../../lib/learning/opening-demo';
import {evaluateClassifier,formatClassifierNumber as fmt} from '../../../lib/learning/classifier-lesson';
import ScorePreview from './score-plane-preview';
import {scorePlaneRelation} from '../../../lib/learning/score-plane';
import {ClassificationThreeView,ScoreThreeView} from './three-view';
import s from './classifier-lesson.module.css';
import {NeuronUnit} from './neuron-unit';
const factor=(n:number)=>n<0?`(${fmt(n)})`:fmt(n);
const PARAMETERS=[{key:'a',label:'w₁',meaning:'第一个输入的权重'},{key:'b',label:'w₂',meaning:'第二个输入的权重'},{key:'c',label:'b',meaning:'整体加上的偏置'}] as const;
export default function ClassifierLesson(){
 const [id,setId]=useState<CaseId>('separable'),[line,setLine]=useState<Boundary>({...boundaryFor('separable')}),[selected,setSelected]=useState('g'),[parameter,setParameter]=useState<'a'|'b'|'c'>('c'),[space,setSpace]=useState<'map'|'score'>('score');
 const points=caseData(id),point=points.find(p=>p.id===selected)??points[0],value=evaluateClassifier(point,line),count=points.filter(p=>classify(p,line)===p.label).length,view=FRONT,active=PARAMETERS.find(p=>p.key===parameter)!,meaningful=Math.hypot(line.a,line.b)>1e-9;
 const relation=scorePlaneRelation(line);
 const project=(x:number,y:number)=>cameraProject(x,y,view),path=(vertices:readonly {x:number;y:number}[])=>vertices.map((p,i)=>{const q=project(p.x,p.y);return `${i?'L':'M'}${q.x},${q.y}`;}).join(' ');
 function changeCase(){const next=id==='separable'?'xor':'separable';setId(next);setSelected(next==='xor'?'b':'g');setLine({...boundaryFor(next)});}
 return <section id="one-neuron" className={s.lesson} data-classifier-lesson aria-labelledby="one-neuron-title">
  <header className={s.heading}><span>02 / 从分类线，到一个神经元</span><h2 id="one-neuron-title">这条线，究竟在算什么？</h2><p>先取一个点。把它的两个坐标分别乘上权重，再加一个偏置，得到分数 z。分数不小于 0，就判断为类别 1；否则是类别 0。</p></header>
  <p className={s.prompt}>先调 b：分数平面整体升降，交线随之移动。再调 w₁ 或 w₂：平面倾斜改变。观察选中点的分数何时穿过零面。</p>
  <div className={s.experiment}>
   <div className={s.plotColumn}>
    <label className={s.sampleSelect}><span>选一个点，看它怎样被分类</span><select value={point.id} onChange={e=>setSelected(e.target.value)} aria-label="选择计算的样本">{points.map(p=><option key={p.id} value={p.id}>点 {p.id.toUpperCase()} · ({fmt(p.x)}, {fmt(p.y)}) · 类别 {p.label}</option>)}</select></label>
    <div className={s.caseControls}><button onClick={changeCase}>{id==='separable'?'换成 XOR 点':'换回第一组'}</button><button aria-pressed={space==='map'} onClick={()=>setSpace('map')}>2D 分类图</button><button aria-pressed={space==='score'} onClick={()=>setSpace('score')}>3D 分数平面</button></div>
    <div className={s.plotHeading}><span>{id==='separable'?'第一组 · 8 个点':'第二组 · 4 个 XOR 角点'}</span><strong>{count} / {points.length}<small> 当前分对</small></strong></div>
    <div className={s.plot} role="group" aria-label={`当前分类区域。选中点 ${point.id.toUpperCase()}，真实类别 ${point.label}，预测类别 ${value.predicted}。${space==='score'?'第三维是计算得到的分数，不是第三个输入。':'平面两轴都是输入。'}`}>
     {space==='score'?<ScoreThreeView id={id} line={line} selected={point.id} fallback={<ScorePreview id={id} line={line} selected={point.id}/>}/>:<ClassificationThreeView view={view} id={id} proof={false} opacity={1} line={line} selected={point.id} fallback={<svg viewBox="0 0 400 308" aria-hidden="true">
      <path d={path(clippedRegion(line,false))+'Z'} fill="#1c1c1b"/><path d={path(clippedRegion(line,true))+'Z'} fill="#242423"/>
      {Array.from({length:17},(_,r)=>Array.from({length:25},(_,c)=>{const x=-.96+c*.08,y=-.96+r*.12,q=project(x,y);return <text key={`${r}-${c}`} x={q.x} y={q.y} textAnchor="middle" fill={classify({x,y},line)?'#999992':'#646460'} fontSize="7">{classify({x,y},line)?'+':':'}</text>;}))}
      {[-1,-.5,0,.5,1].map(n=><g key={n} stroke="#454542" strokeWidth=".6"><path d={path([{x:n,y:-1},{x:n,y:1}])}/><path d={path([{x:-1,y:n},{x:1,y:n}])}/></g>)}
      {meaningful&&<path d={path(boundarySegment(line))} fill="none" stroke="#e8e8e2" strokeWidth="1.6"/>}
      {points.map(p=>{const q=project(p.x,p.y);return <g key={p.id}>{classify(p,line)!==p.label&&<rect x={q.x-10} y={q.y-10} width="20" height="20" fill="none" stroke="#bcbcb5" strokeDasharray="2 3"/>}{p.id===point.id&&<rect x={q.x-12} y={q.y-12} width="24" height="24" fill="none" stroke="#fff" strokeDasharray="6 12"/>}{p.label===0?<rect x={q.x-5} y={q.y-5} width="10" height="10" fill="#151515" stroke="#b0b0a9" strokeWidth="2"/>:<path d={`M${q.x-6} ${q.y-6}h12v12h-12z`} fill="#f0f0e9"/>}</g>;})}
     </svg>}/>}

    </div>
    <div className={s.controls}><p className={s.note}>正在调整：单神经元分类参数。它们改变分数平面；输入地图与样本位置保持不动。</p>
     <div className={s.flipDemo}><span>看两侧为什么翻转：固定 w₂ = 0、b = 0</span><div role="group" aria-label="权重跨过零的三步示范">{[1,0,-1].map(a=><button key={a} aria-pressed={line.a===a&&line.b===0&&line.c===0} onClick={()=>{setLine({a,b:0,c:0});setParameter('a');}}>w₁ = {a>0?'+1':a===0?'0':'−1'}</button>)}</div></div>
     <div className={s.parameterChoice} role="group" aria-label="选择要调整的参数">{PARAMETERS.map(p=><button key={p.key} aria-pressed={parameter===p.key} onClick={()=>setParameter(p.key)}>{p.label}</button>)}<button className={s.reset} onClick={()=>setLine({...boundaryFor(id)})}>重置参数</button></div>
     <label className={s.slider}><span>{active.label} = {fmt(line[parameter])}<small>{active.meaning}</small></span><input aria-label={`调整 ${active.label}`} type="range" min="-2" max="2" step=".05" value={line[parameter]} onChange={e=>setLine(current=>({...current,[parameter]:Number(e.target.value)}))}/></label>
     <p className={s.localResult}><b>点 {point.id.toUpperCase()}：z = {fmt(value.score)}</b><span>预测 {value.predicted} · 真实 {point.label} · {value.predicted===point.label?'分对':'分错'}</span></p>
    </div>
    <p className={s.signReading}>{line.b===0&&line.c===0?(line.a>0?'此时 z = w₁x₁：x₁ > 0 的一侧在零面上方，预测为 1；x₁ < 0 的一侧在下方，预测为 0。':line.a<0?'w₁ 变负后，平面反向倾斜：x₁ > 0 的一侧改为预测 0，x₁ < 0 的一侧改为预测 1。非零时分界线仍是 x₁ = 0，但两侧的正负对换了。':'w₁ = w₂ = b = 0：分数面与零面完全重合，所有点都算出 0。按 z ≥ 0 判 1 的约定，整图暂时都是类别 1。没有唯一分类线。'):'一个点只有在总分 z 穿过 0 时才换类。一般情况下，调整 w₁ 并不意味着整张图的两侧一起翻转。'}</p>
    <p className={s.legend}><span>□ 真实类别 0　▣ 真实类别 1</span><span>z &lt; 0：字符 : 预测 0　z ≥ 0：字符 + 预测 1</span><span>{space==='score'?'亮色网格是分数平面；底图是 z = 0 参考面。白色交线就是分类边界；竖虚线连接选中点与它的分数。':'白线 z = 0；角标选中点；虚框为分错点。'}</span></p>
    {!meaningful&&<p className={s.note}>{relation==='coincident'?'两个平面完全重合：所有位置 z = 0，按 z ≥ 0 的规则全部预测为 1，没有唯一交线。':`两个平面平行，分数平面在零面的${relation==='above'?'上':'下'}方；没有交线，全部预测为 ${value.predicted}。`}</p>}{relation==='tangent'&&<p className={s.note}>交线只接触当前地图的一个角点，没有穿过图内。</p>}{meaningful&&relation==='outside'&&<p className={s.note}>交线不穿过当前显示的输入范围，图内没有可见分类线。</p>}

    <p className={s.note}>2D / 3D 使用完全相同的参数与样本。高度轴是分数 z，刻度固定在 −6 到 6；它不是第三个输入。换组会载入对应示范参数。</p>
   </div>
   <div className={s.calculation}><h3 className={s.calculationTitle}>点 {point.id.toUpperCase()} 的神经元计算</h3>

    <div id="neuron-design" style={{scrollMarginTop:24}}><NeuronUnit inputs={[{label:'x₁',value:point.x,weight:line.a},{label:'x₂',value:point.y,weight:line.b}]} bias={line.c} activation="threshold" output={value.predicted}/></div>
    <div className={s.formula}><span>同一次计算，写成公式</span><p>z = w₁x₁ + w₂x₂ + b</p><p>{factor(line.a)} × {factor(point.x)} + {factor(line.b)} × {factor(point.y)} + {factor(line.c)} = <b>{fmt(value.score)}</b></p></div>
    <p>这个“先加权求和，再过阈值”的单元，就是一个最简单的分类神经元。真实标签 {point.label} 只用来核对答案，不参与它的计算。</p>
   </div>
  </div>
  <div className={s.insight}><h3>分类线，是两个平面的交线。</h3><p>在 3D 里，把每个输入位置的分数画成高度，得到 z = w₁x₁ + w₂x₂ + b 这张分数平面。地图放在 z = 0 的水平面上：分数平面高于它的位置判为 1，低于它的位置判为 0。两张平面的交线已经落在地图上；回到 2D，看到的就是同一条分类边界。并不是整张分数平面投影成了一条线。</p><p>计算图每次只处理选中的一个点。网格的背景，则把平面上的许多位置逐个送进<strong>同一个神经元</strong>：哪里算出 z ≥ 0，就标成“+”；哪里 z &lt; 0，就标成“:”。两侧相接的地方满足 w₁x₁ + w₂x₂ + b = 0，当权重不同时为 0 时，这描述的是一条直线。</p><p>改 b，会给所有点加上同一个分数；改 w₁，对某个点的影响是 Δw₁ × x₁。因此 x₁ 为 0 的点不受 w₁ 影响，正、负 x₁ 的点会向相反方向变化。权重决定线的方向；偏置和权重一起决定位置。</p></div>
  <div className={s.limit}><span>下一道坎</span><h3>多算几层，就能把 XOR 分开吗？</h3><p>点“换成 XOR 点”，仍是前面那四个角点、相同的真实类别。怎样调这三个参数，单条直线都无法分对全部 4 个点。再叠一层，若中间仍然只有乘法和加法，也不会突破这个限制。</p><div className={s.affine}><p>先算 h₁ = x₁ + x₂，h₂ = x₁ − x₂</p><p>再算 z = 0.5h₁ + 0.5h₂ = x₁</p></div><p>看起来多了两个中间节点，展开以后仍是原来的一条直线。一般地，h = Ax + d、z = vᵀh + c，合起来就是 z = (vᵀA)x + (vᵀd + c)。这种带偏置的线性计算叫<strong>仿射变换</strong>。</p><p className={s.nextQuestion}>要突破直线的限制，中间必须出现非线性。接下来要改变的是点的表示方式，而不只是相机角度。</p><p className={s.source}>延伸阅读：<a href="https://d2l.ai/chapter_multilayer-perceptrons/mlp.html" target="_blank" rel="noreferrer">《动手学深度学习》：隐藏层与非线性</a></p></div>
 </section>;
}
