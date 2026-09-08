"use client";
import { memo, useEffect, useState, useRef } from 'react';
import { initialNetwork, quadraticDemo, fitParabola, polynomial } from './update-demo-model';
import lesson from '../explain/lesson.module.css';
import s from './update-playground.module.css';
const labels=['前向计算','比较目标','反向传递','更新权重'];
const fmt=(v:number)=>v.toFixed(3);
function useSmoothWeights(target:number[][],open:boolean,fast:boolean){
 const [value,setValue]=useState(target),current=useRef(target);
 const key=JSON.stringify(target);
 useEffect(()=>{
  const end=JSON.parse(key) as number[][];
  if(!open)return;
  const start=current.current,begin=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:fast?150:700;
  let id=0;
  const tick=(now:number)=>{const t=duration?Math.min(1,(now-begin)/duration):1,ease=t*t*(3-2*t);const w=start.map((row,j)=>row.map((v,i)=>v+(end[j][i]-v)*ease));current.current=w;setValue(w);if(t<1)id=requestAnimationFrame(tick);};
  id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
 },[key,open,fast]);
 return value;
}
const signed=(v:number)=>`${v<0?'−':'+'} ${Math.abs(v).toFixed(4)}`;
const termColors=['#b45c69','#64833c','#ad7b25'];
const termNames=['二次项','一次项','常数项'];
const termRules=['ua₁² + va₂²','2ua₁b₁ + 2va₂b₂','ub₁² + vb₂²'];
export default memo(function UpdatePlayground(){
 const [open,setOpen]=useState(false),[auto,setAuto]=useState(false);
 const [x,setX]=useState(.5),[fastLeft,setFastLeft]=useState(0);
 const inputs=[x,1],target=x*x;
 const [coefficient,setCoefficient]=useState<number|null>(null);
 const [selected,setSelected]=useState(0),[column,setColumn]=useState(0);
 const [run,setRun]=useState({weights:initialNetwork,phase:0,round:1});
 const {weights,phase,round}=run,raw=quadraticDemo(inputs,target,weights),next=fitParabola(weights),post=quadraticDemo(inputs,target,next);
 const d={...raw,next,nextHidden:post.hidden,nextOutput:post.output,nextLoss:post.loss};
 const shown=useSmoothWeights(phase===3?next:weights,open,fastLeft>0),display=quadraticDemo(inputs,target,shown);
 const coefficients=polynomial(shown);
 const termParts=[shown[2].map((v,j)=>v*shown[j][0]**2),shown[2].map((v,j)=>2*v*shown[j][0]*shown[j][1]),shown[2].map((v,j)=>v*shown[j][1]**2)];
 const partFormula=(k:number,j:number)=>k===0?`(${fmt(shown[2][j])}) × (${fmt(shown[j][0])})²`:k===1?`2 × (${fmt(shown[2][j])}) × (${fmt(shown[j][0])}) × (${fmt(shown[j][1])})`:`(${fmt(shown[2][j])}) × (${fmt(shown[j][1])})²`;
 const relevant=(j:number,i:number)=>coefficient===null||j===2||coefficient===1||i===(coefficient===0?0:1);
 useEffect(()=>{if(!open||fastLeft<=0)return;const id=setInterval(()=>{if(!document.hidden){setRun(r=>({weights:fitParabola(r.weights),phase:0,round:r.round+1}));setFastLeft(n=>n-1);}},190);return()=>clearInterval(id);},[open,fastLeft]);
 const averageGradient=(weights[selected][column]-next[selected][column])/.2;
 const hidden=display.hidden;
 useEffect(()=>{if(!open||!auto)return;const id=setInterval(()=>{if(document.hidden)return;setRun(r=>r.phase<3?{...r,phase:r.phase+1}:{weights:fitParabola(r.weights),phase:0,round:r.round+1});},1600);return()=>clearInterval(id);},[open,auto,x]);
 function step(){setAuto(false);setFastLeft(0);setRun(r=>r.phase<3?{...r,phase:r.phase+1}:{weights:fitParabola(weights),phase:0,round:r.round+1});}
 const name=selected===2?'输出神经元':`神经元 ${selected===0?'A':'B'}`;
 const source=selected===2?d.hidden:inputs;
 return <details className={s.intro} onToggle={e=>{setOpen(e.currentTarget.open);if(!e.currentTarget.open){setAuto(false);setFastLeft(0);}}}>
  <summary>动手教网络学会 y = x²<span>看答案 → 猜答案 → 调整权重</span></summary>
  {open&&<div className={s.content}>
   <div className={s.unified}>
   <div className={s.experiment}>
    <div>
     <div className={s.drawing}>
     <svg className={s.mobileNetwork} viewBox="0 0 350 350" role="group" aria-label="手机完整计算图：输入向下经过求和、平方激活和输出">
      <g fill="none" strokeWidth="1.4" pointerEvents="none"><path d="M85 117V151M265 117V151" stroke="#bdcfdd"/>{[0,1,2].flatMap(j=>[0,1].map(i=><path key={`${j}-${i}`} d={j===2?`M${i===0?85:265} 201L175 257`:`M${i===0?85:265} 47L${j===0?85:265} 80`} stroke={coefficient!==null&&relevant(j,i)?termColors[coefficient]:'#bdcfdd'} opacity={relevant(j,i)?1:.18}/>))}</g>
      <g fontSize="12" fill="currentColor" textAnchor="middle">
       <text x="85" y="16">输入 x = {x.toFixed(2)}</text><text x="265" y="16">常数 1</text>
       <circle cx="85" cy="38" r="9" fill="#355f7e"/><circle cx="265" cy="38" r="9" fill="#7e97aa"/>
       {[0,1].map(j=>{const cx=j===0?85:265,z=shown[j][0]*x+shown[j][1];return <g key={j} role="button" tabIndex={0} aria-label={`手机选择神经元 ${j===0?'A':'B'}`} onClick={()=>setSelected(j)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(j);}}}>
        <rect x={cx-69} y="80" width="138" height="123" fill="transparent"/><rect x={cx-69} y="80" width="138" height="42" fill={selected===j?'#edf3f7':'#fafbfd'} stroke="#7595ac"/><text x={cx} y="97" fontSize="10">求和 a{j+1}x + b{j+1}</text><text x={cx} y="113">{fmt(z)}</text>
        <rect x={cx-69} y="151" width="138" height="51" fill="#edf3f7" stroke={selected===j?'#355f7e':'#94adbf'}/><text x={cx} y="171" fontSize="14">({fmt(z)})²</text><text x={cx} y="191">{j===0?'A':'B'} = {fmt(hidden[j])}</text>
       </g>;})}
       <text x="175" y="141" fontSize="10" fill="#738a9a">平方激活 f(z) = z²</text>
       <text x="80" y="230" fontSize="10">u = {fmt(shown[2][0])}</text><text x="270" y="230" fontSize="10">v = {fmt(shown[2][1])}</text>
       <g role="button" tabIndex={0} aria-label="手机选择输出神经元" onClick={()=>setSelected(2)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(2);}}}><rect x="90" y="257" width="170" height="44" fill={selected===2?'#edf3f7':'#fafbfd'} stroke="#7595ac"/><text x="175" y="274" fontSize="10">网络输出 uA + vB</text><text x="175" y="293" fontSize="15">ŷ = {fmt(display.output)}</text><text x="175" y="321" fontSize="12" fill="#a77234">目标 x² = {fmt(target)}</text><text x="175" y="341" fontSize="11" fill="#708697">误差 {display.error>=0?'+':''}{fmt(display.error)}</text></g>
      </g>
     </svg><svg className={s.desktopNetwork} viewBox="0 0 660 285" role="group" aria-label="输入、加权求和、独立平方激活层、输出四个计算阶段" data-demo-phase={phase}>
      <rect x="315" y="48" width="155" height="221" fill="#f0f5f8" stroke="#d5e1e9"/>
      <g fontSize="12" textAnchor="middle" fill="currentColor"><text x="48" y="24">① 输入</text><text x="214" y="24">② 加权求和</text><text x="392" y="24">③ 平方后输出</text><text x="607" y="24">④ 输出</text><text x="392" y="67" fontSize="10" fill="#708697">激活函数 · f(z) = z²</text></g>
      {[0,1,2].flatMap(j=>[0,1].map(i=>{const ax=j===2?449:75,ay=j===2?111+i*103:111+i*103,bx=j===2?580:185,by=j===2?160:111+j*103;const middle=(ax+bx)/2;const path=phase===2?`M${bx} ${by}C${middle} ${by} ${middle} ${ay} ${ax} ${ay}`:`M${ax} ${ay}C${middle} ${ay} ${middle} ${by} ${bx} ${by}`;return <g key={`${j}-${i}`} opacity={coefficient===null?(j===selected?1:.25):relevant(j,i)?1:.12}><path d={path} stroke={coefficient!==null&&relevant(j,i)?termColors[coefficient]:shown[j][i]>=0?'#355f7e':'#a77234'} strokeWidth={j===selected&&i===column?2.3:1.2} fill="none"/><path d={path} className={auto&&(phase===0||phase===2)?((phase===0?j<2:j===2)?s.forwardFirst:s.forwardSecond):undefined} pathLength={100} strokeDasharray="5 95" stroke={phase===2?'#a77234':'#355f7e'} strokeWidth="2" fill="none" opacity={phase===0||phase===2?.8:0}/></g>;}))}
      {[0,1].map(j=>{const y=111+j*103,z=shown[j][0]*x+shown[j][1];return <g key={j}>
       <path d={`M244 ${y}H337`} stroke="#7898ad" fill="none" strokeWidth="1.4" markerEnd="url(#demo-arrow)"/>
       <text x="290" y={y-9} fontSize="10" textAnchor="middle" fill="#708697">{fmt(z)}</text>
       <g role="button" tabIndex={0} aria-label={`查看${j===0?'A':'B'}的权重向量`} aria-pressed={selected===j} onClick={()=>setSelected(j)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(j);}}} style={{cursor:'pointer'}}>
        <circle cx="214" cy={y} r="29" fill="#fafbfd" stroke={selected===j?'#355f7e':'#a6b9c7'} strokeWidth={selected===j?2:1}/>
        <text x="214" y={y+4} fontSize="12" textAnchor="middle" fill="currentColor">{fmt(z)}</text>
        <text x="214" y={y+45} fontSize="10" textAnchor="middle" fill="#708697">a{j+1}={fmt(shown[j][0])} · b{j+1}={fmt(shown[j][1])}</text>
        <rect x="337" y={y-29} width="112" height="58" rx="3" fill={selected===j?'#e5eef4':'#fafbfd'} stroke={selected===j?'#355f7e':'#a6b9c7'}/>
        <text x="393" y={y-7} fontSize="15" textAnchor="middle" fill="#355f7e">({fmt(z)})²</text>
        <text x="393" y={y+14} fontSize="11" textAnchor="middle" fill="currentColor">输出 {j===0?'A':'B'} = {fmt(hidden[j])}</text>
        <text x="393" y={y+45} fontSize="10" textAnchor="middle" fill="#708697">({fmt(z)})² → {fmt(hidden[j])}</text>
       </g>
      </g>;})}
      <defs><marker id="demo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1L9 5L0 9" fill="none" stroke="#7898ad" strokeWidth="1.5"/></marker></defs>
      <g textAnchor="middle" fontSize="12" fill="currentColor">
       {inputs.map((v,i)=><g key={i}><circle cx="48" cy={111+i*103} r="26" fill="#fafbfd" stroke="#6288a4"/><text x="48" y={115+i*103}>{fmt(v)}</text><text x="48" y={154+i*103} fontSize="10">{i===0?'x':'常数 1'}</text></g>)}
       <g role="button" tabIndex={0} aria-label="查看输出的权重向量" aria-pressed={selected===2} onClick={()=>setSelected(2)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(2);}}} style={{cursor:'pointer'}}><circle cx="607" cy="160" r="28" fill={selected===2?'#edf3f7':'#fafbfd'} stroke="#6288a4"/><text x="607" y="164">{fmt(display.output)}</text><text x="600" y="207" fontSize="11">ŷ = uA + vB</text><text x="505" y="116" fontSize="10" fill="#708697">u={fmt(shown[2][0])}</text><text x="505" y="214" fontSize="10" fill="#708697">v={fmt(shown[2][1])}</text><text x="600" y="230" fontSize="11" fill="#a77234">目标 x² = {fmt(target)}</text><text x="600" y="250" fontSize="10" fill="#708697">误差 {display.error>=0?'+':''}{fmt(display.error)}</text></g>
      </g>
     </svg></div>
     <div className={s.termBridge} aria-label="网络权重展开为三个多项式系数">
      {termRules.map((rule,k)=><button key={rule} data-coefficient-source={k} style={{'--term-color':termColors[k]} as React.CSSProperties} aria-pressed={coefficient===k} onClick={()=>setCoefficient(v=>v===k?null:k)}><span>{termNames[k]}</span><b>{rule}</b><strong>≈ {coefficients[k].toFixed(4)}</strong></button>)}
     </div>
     {coefficient!==null&&<div className={s.termCalculation} style={{'--term-color':termColors[coefficient]} as React.CSSProperties}>
      <b>{termNames[coefficient]}系数 = A 支路的贡献 + B 支路的贡献</b>
      <div>{[0,1].map(j=><p key={j}><span>支路 {j===0?'A':'B'}</span>{partFormula(coefficient,j)} ≈ <strong>{termParts[coefficient][j].toFixed(4)}</strong></p>)}</div>
      <p>合计：({termParts[coefficient][0].toFixed(4)}) + ({termParts[coefficient][1].toFixed(4)}) ≈ {coefficients[coefficient].toFixed(4)}</p>
      <small>a₁、a₂ 是 x 的权重；b₁、b₂ 是偏置（常数 1 的权重）；u、v 是输出连接的权重。同色标记对应同一个系数，非正负颜色。</small>
     </div>}
     <details className={s.weightDrawer}><summary>查看六个权重 · 向量与矩阵</summary><div className={s.matrices}>
      <div><b>隐藏层矩阵 · 2 行 × 2 列</b><small>每行一组 [a, b]，计算 ax + b</small><div className={s.matrix}>{[0,1].map(j=><div key={j} data-selected={selected===j}><span>{j===0?'A':'B'}</span>{shown[j].map((w,i)=><button key={i} aria-label={`${j===0?'A':'B'} 来自输入 ${i+1} 的权重`} aria-pressed={selected===j&&column===i} onClick={()=>{setSelected(j);setColumn(i);}}>{fmt(w)}</button>)}</div>)}</div></div>
      <div><b>输出层矩阵 · 1 行 × 2 列</b><small>网络输出 = u × A + v × B</small><div className={s.matrix}><div data-selected={selected===2}><span>输出</span>{shown[2].map((w,i)=><button key={i} aria-label={`输出来自 ${i===0?'A':'B'} 的权重`} aria-pressed={selected===2&&column===i} onClick={()=>{setSelected(2);setColumn(i);}}>{fmt(w)}</button>)}</div></div></div>
     </div></details>
    </div>
    <details className={s.explain}><summary>查看选中神经元的完整算式</summary>
     <span>第 {round} 次 · {labels[phase]} · {name}</span>
     <h3>{selected===2?'ŷ = uA + vB':selected===0?'A = (a₁x + b₁)²':'B = (a₂x + b₂)²'}</h3>
     <p>权重向量 = [{shown[selected].map(fmt).join(', ')}]<br/>{selected===2?'两个系数分别乘 A、B，再相加。':'两个系数分别乘 x 和 1，就组成 ax + b。'}</p>
     {phase===0?<><strong>{fmt(source[0])} × {fmt(weights[selected][0])}<br/>+ {fmt(source[1])} × {fmt(weights[selected][1])}</strong><small>{selected===2?'相加就是输出。':`然后平方激活：f(${fmt(weights[selected][0]*x+weights[selected][1])}) = ${fmt(d.hidden[selected])}。平方这一步带来二次项。`}</small></>:phase===1?<><p>这道题的损失 = (ŷ − x²)² ÷ 2</p><strong>({fmt(d.output)} − {target.toFixed(2)})² ÷ 2 = {fmt(d.loss)}</strong></>:phase===2?<><p>每个权重的梯度 = 本单元收到的反馈 × 该连线的输入</p><strong>本行梯度 = [{d.gradients[selected].map(fmt).join(', ')}]</strong><small>{selected===2?'输出反馈 = 输出 − 目标。':'隐藏层反馈 = 输出误差 × 对应输出权重 × 平方函数的斜率 2(ax + b)。'} 输入不同，各条权重的梯度也可能不同。</small></>:<><p>每一格：新权重 = 旧权重 − 0.2 × 21 题的平均梯度</p><strong>选中这格：{fmt(weights[selected][column])} − 0.2 × ({fmt(averageGradient)}) = {fmt(d.next[selected][column])}</strong><small>六个权重用 21 题的平均梯度一起更新。这道题的损失 {fmt(d.loss)} → {fmt(d.nextLoss)}。</small></>}
    </details>
   </div>

   <div className={s.functionStage}>
    <div className={s.formulaPanel}>
     <div className={s.formulaHeading}><span>网络现在学到的函数</span><b>第 {round-1} 次更新{phase===3?' → 下一次':''}</b></div>
     <div className={s.mainFormula} data-current-polynomial>ŷ ≈ {coefficients.map((value,k)=><span className={s.formulaTerm} key={k}>{k>0&&<span>{value<0?'−':'+'}</span>}<button data-formula-coefficient={k} style={{'--term-color':termColors[k]} as React.CSSProperties} aria-label={`追踪${termNames[k]}系数`} aria-pressed={coefficient===k} onClick={()=>setCoefficient(v=>v===k?null:k)}>{(k===0?value:Math.abs(value)).toFixed(4)}</button>{k===0?'x²':k===1?'x':''}</span>)}</div><small>点彩色系数，对照网络中的同色算式与连线。</small>

     <details className={s.derivation}><summary>展开算式与三个系数</summary>     <div className={s.coefficients}>{coefficients.map((v,i)=><div key={i}><span>{['二次项 · 控制弯曲','一次项 · 影响对称轴','常数项 · 上下偏移'][i]}</span><strong>{v.toFixed(4)}</strong><small>目标 {i===0?'1':'0'}</small></div>)}</div><p>ŷ = u(a₁x + b₁)² + v(a₂x + b₂)²</p><p>ŷ = ({fmt(shown[2][0])})({fmt(shown[0][0])}x {signed(shown[0][1])})²<br/>+ ({fmt(shown[2][1])})({fmt(shown[1][0])}x {signed(shown[1][1])})²</p><p>展开：二次项 ua₁² + va₂²；一次项 2ua₁b₁ + 2va₂b₂；常数项 ub₁² + vb₂²。</p></details>
     <small>全部权重的等价展开 · 四位小数</small>
    </div>
   <div className={s.functionPlot}>
    <svg viewBox="0 0 620 190" role="img" aria-label="二次函数与网络预测曲线对比">
     <path d="M40 145H585M310 30V170" fill="none" stroke="#c8d5df"/>
     <path d={Array.from({length:81},(_,i)=>{const v=-1+i/40;return `${i?'L':'M'}${310+v*250} ${145-v*v*100}`;}).join(' ')} fill="none" stroke="#a77234" strokeWidth="2"/>
     <path d={Array.from({length:81},(_,i)=>{const v=-1+i/40,y=quadraticDemo([v,1],v*v,shown).output;return `${i?'L':'M'}${310+v*250} ${145-y*100}`;}).join(' ')} fill="none" stroke="#355f7e" strokeWidth="2"/>
     <path d={`M${310+x*250} ${145-target*100}V${145-display.output*100}`} stroke="#859bad" strokeDasharray="3 3"/>
     <circle cx={310+x*250} cy={145-target*100} r="4" fill="#a77234"/><circle cx={310+x*250} cy={145-display.output*100} r="4" fill="#355f7e"/>
     <g fontSize="11" fill="currentColor"><text x="50" y="182">−1</text><text x="316" y="182">0</text><text x="558" y="182">1</text><text x="575" y="139">x</text><text x="318" y="20">y</text><text x="55" y="18" fill="#a77234">标准答案 y = x²</text><text x="410" y="18" fill="#355f7e">网络预测 ŷ</text></g>
    </svg><small>棕线：目标 x² · 蓝线：网络预测</small>

   </div>
   </div>
   </div>
   <div className={s.playbar}>
<div className={`${s.controls} ${lesson.miniControls}`}>
    <label>自变量 x <b>{x.toFixed(2)}</b><input aria-label="二次函数输入 x" type="range" min="-1" max="1" step=".01" value={x} onChange={e=>{setX(+e.target.value);setRun(r=>({...r,phase:0}));}}/></label>
</div>
   <div className={s.steps}>{labels.map((label,i)=><button key={label} aria-pressed={phase===i} onClick={()=>{setAuto(false);setFastLeft(0);setRun(r=>({...r,phase:i}));}}>{i+1} · {label}</button>)}</div>
    <div><button onClick={()=>{setFastLeft(0);setAuto(v=>!v);}} aria-pressed={auto}>{auto?'暂停小实验':'自动演示'}</button><button onClick={step}>下一步</button><button onClick={()=>{setAuto(false);setFastLeft(n=>n?0:100);}}>{fastLeft?`停止快练 · 还剩 ${fastLeft} 次`:'快练 100 次'}</button><button onClick={()=>{setAuto(false);setFastLeft(0);setRun({weights:initialNetwork,phase:0,round:1});}}>重置权重</button></div>
   </div>
   <details className={s.caption}><summary>这和真实网络有什么关系？</summary><p>对应下方真实网络：第一层每个神经元接收 7 个输入，128 组排成 128 × 7；第二层是 128 × 128；输出层是 1 × 128。偏置另存，不在这些权重格里。本小实验用常数输入表示隐藏层偏置，输出层省略偏置；用平方函数替代真实网络的 tanh，采用平方误差与简单梯度下降教学；真实 PPO 的损失和优化器更复杂。</p></details>
  </div>}
 </details>;
});
