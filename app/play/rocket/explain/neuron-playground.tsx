"use client";
import {memo,useEffect,useState} from 'react';
import styles from './lesson.module.css';
const number=(v:number)=>v.toFixed(2);
const curve=Array.from({length:81},(_,i)=>{const x=-3+i*6/80;return `${i?'L':'M'}${480+(x+3)*24} ${111-Math.tanh(x)*45}`;}).join(' ');
export default memo(function NeuronPlayground(){
 const [x,setX]=useState(1),[y,setY]=useState(1),[negative,setNegative]=useState(true),[compress,setCompress]=useState(true),[auto,setAuto]=useState(false),[focus,setFocus]=useState(0);
 const coefficient=negative?-.5:.5,a=x*.8,b=y*coefficient,sum=a+b+.2,out=compress?Math.tanh(sum):sum;
 useEffect(()=>{if(!auto)return;let id=0,last=0;const start=performance.now();const tick=(now:number)=>{if(now-last>40){setX(Math.sin((now-start)/1400)*2);last=now;}id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);},[auto]);
 const color=(v:number)=>v>=0?'#315c80':'#a77234';
 return <details className={styles.neuronIntro}><summary>动手认识一个神经元</summary><p>教学小模型 · 系数是演示用的，不是下面火箭的策略。拖动输入，看一个数怎样传到输出。</p>
 <div className={styles.miniControls}><label>输入 x <b>{number(x)}</b><input aria-label="演示输入 x" type="range" min="-2" max="2" step=".01" value={x} onChange={e=>{setAuto(false);setX(Number(e.target.value));}}/></label><label>输入 y <b>{number(y)}</b><input aria-label="演示输入 y" type="range" min="-2" max="2" step=".01" value={y} onChange={e=>setY(Number(e.target.value))}/></label><div><button onClick={()=>setAuto(!auto)} aria-pressed={auto}>{auto?'停止演示':'自动改变 x'}</button><button onClick={()=>setNegative(!negative)}>y 的系数：{negative?'−0.5':'＋0.5'} ⇄</button><button onClick={()=>setCompress(!compress)} aria-pressed={compress}>{compress?'压缩函数：开':'压缩函数：关'}</button></div></div>
 <div className={styles.miniViewport}><svg viewBox="0 0 740 200" role="img" aria-label={`输入乘系数，求和 ${number(sum)}，输出 ${number(out)}`}>
 <g fill="none" strokeWidth="2" className={styles.miniFlow}><path d="M72 58H200Q230 58 300 104" stroke={color(a)}/><path d="M72 148H200Q230 148 300 104" stroke={color(b)}/><path d="M362 104H470M622 104H670" stroke={color(sum)}/></g>
 <g fontSize="13" textAnchor="middle" fill="currentColor"><circle cx="52" cy="58" r="22" fill="var(--snn-bg)" stroke={color(x)}/><text x="52" y="63">{number(x)}</text><circle cx="52" cy="148" r="22" fill="var(--snn-bg)" stroke={color(y)}/><text x="52" y="153">{number(y)}</text>
 <text x="151" y="42">× 0.8</text><text x="151" y="81" fill={color(a)}>a₁ = {number(a)}</text><text x="151" y="130">× ({number(coefficient)})</text><text x="151" y="171" fill={color(b)}>a₂ = {number(b)}</text>
 <circle cx="331" cy="104" r="31" fill="var(--snn-bg)" stroke={color(sum)} strokeWidth="2"/><text x="331" y="109">{number(sum)}</text><text x="331" y="53">全部相加</text><text x="331" y="156">a₁ + a₂ + 0.2</text>
 <text x="550" y="33">{compress?'压缩到 −1～1':'直接传递'}</text><path d="M480 111H624M552 58V161" stroke="#cdd4dd"/><path d={compress?curve:'M480 156L624 66'} fill="none" stroke="#315c80" strokeWidth="2"/><circle cx={480+(sum+3)*24} cy={compress?111-Math.tanh(sum)*45:111-sum*15} r="5" fill={color(out)}/>
 <text x="701" y="81">输出</text><text x="701" y="113" fontSize="20" fill={color(out)}>{number(out)}</text><text x="550" y="184">输入变了，曲线上的点也会移动</text></g></svg></div>
 <div className={styles.miniTabs}>{['① 乘系数','② 全部相加','③ 函数变换'].map((s,i)=><button key={s} aria-pressed={focus===i} onClick={()=>setFocus(i)}>{s}</button>)}</div>
 <p className={styles.miniExplanation}>{focus===0?`贡献 = 输入 × 系数。试着翻转 y 的系数：同一个输入，会把总和往相反方向推。蓝色是正贡献，棕橙色是负贡献。`:focus===1?`S = a₁ + a₂ + b = (${number(a)}) + (${number(b)}) + 0.20 = ${number(sum)}。这里的 b 是固定数。`:`输出 = f(S) = ${number(out)}。试着关闭压缩：只有乘法和加法，多层仍能合成线性计算；加入这样的曲线，网络才能表达更复杂的关系。`}</p>
 <p>真实网络把很多这样的单元连起来：这一层的输出 → 下一层的输入。推理时系数固定；训练才会调整系数。下面可以看真实网络怎样控制火箭。</p>
 </details>;
});
