import {material} from '../../../lib/design/tokens';
import {valueColor} from '../../../lib/design/value-color';
import {formatClassifierNumber as fmt} from '../../../lib/learning/classifier-lesson';
import s from './neuron-unit.module.css';

type Input={label:string;value:number;weight:number};
type Props={inputs:Input[];bias:number;activation:'threshold'|'relu'|'identity'|'transition';output?:number;title?:string};
const symbol=(v:number)=>v===0?':':v>0?'+':'−';

/** A computational diagram: dendrites carry weighted contributions, the soma sums, the exit activates. */
export function NeuronUnit({inputs,bias,activation,output,title}:Props){
 const contributions=inputs.map(i=>i.value*i.weight),sum=contributions.reduce((a,b)=>a+b,0)+bias;
 const result=output??(activation==='relu'?Math.max(0,sum):activation==='threshold'?(sum>=0?1:0):sum);
 const gate=activation==='relu'?'ReLU':activation==='threshold'?'z ≥ 0':activation==='identity'?'直接传递':'显示过渡';
 const paths=inputs.map((input,index)=>{const sy=inputs.length===1?142:82+index*130;return {input,sy,contribution:contributions[index]};});
 const soma:Array<{x:number;y:number;edge:boolean}>=[];
 for(let row=-11;row<=11;row++)for(let col=-12;col<=12;col++){
   const nx=col/12,ny=row/11,width=1-.46*Math.pow(Math.abs(ny),1.65);
   if(Math.abs(nx)>width)continue;
   const edge=Math.abs(nx)>width-.12||Math.abs(ny)>.9;
   if(Math.abs(col)<7&&Math.abs(row)<4)continue;
   soma.push({x:290+col*6.2,y:160+row*6.2,edge});
 }
 return <figure className={s.unit} aria-label={title??'神经元：两路加权输入汇入求和核心，再通过激活出口'}>
  <div className={s.inputs}>{inputs.map((input,i)=><div key={input.label}><span>{input.label} <b>{fmt(input.value)}</b></span><span>× {fmt(input.weight)}</span><output style={{color:valueColor(contributions[i])}}>{fmt(contributions[i])}</output></div>)}</div>
  <svg viewBox="0 0 560 300" role="img" aria-label={`输入贡献 ${contributions.map(fmt).join('、')}，加偏置 ${fmt(bias)}，总和 ${fmt(sum)}，${gate} 后输出 ${fmt(result)}。`}>
   {paths.map(({input,sy,contribution},index)=><g key={index}>
    <text x="16" y={sy-23} className={s.sourceLabel}>{input.label}</text><text x="16" y={sy+7} className={s.sourceValue}>{fmt(input.value)}</text>
    {Array.from({length:46},(_,i)=>{const t=(i+.5)/46,k=t*t*(3-2*t),x=58+t*164,y=sy+(160-sy)*k;return <text key={i} x={x} y={y} fill={valueColor(t<.4?input.value:contribution)} fontSize={t<.4?7:8} textAnchor="middle" dominantBaseline="middle" aria-hidden="true">{symbol(t<.4?input.value:contribution)}</text>;})}
    <g transform={`translate(116 ${sy+(160-sy)*.352})`}><rect x="-23" y="-14" width="46" height="28" fill={material.background}/><text y="5" textAnchor="middle" fill={material.ink} fontSize="16">×{fmt(input.weight)}</text></g>
    <text x="184" y={sy+(160-sy)*.84+(index?25:-13)} textAnchor="middle" fontSize="15" fill={valueColor(contribution)}>{fmt(contribution)}</text>
   </g>)}
   {soma.map((p,i)=><text key={i} x={p.x} y={p.y} fill={p.edge?material.wire:valueColor(sum)} opacity={p.edge ? .8 : .2+Math.min(1,Math.abs(sum)/2)*.65} fontSize="7" textAnchor="middle" dominantBaseline="middle" aria-hidden="true">{p.edge?':':symbol(sum)}</text>)}
   <text x="290" y="153" className={s.coreLabel}>Σ + b</text><text x="290" y="178" textAnchor="middle" fill={material.ink} fontSize="26">{fmt(sum)}</text>
   {Array.from({length:16},(_,i)=><text key={i} x={290} y={241+i*2.3} fill={valueColor(bias)} textAnchor="middle" fontSize="7" aria-hidden="true">{symbol(bias)}</text>)}
   <text x="279" y="282" textAnchor="end" fill={material.secondary} fontSize="15">b={fmt(bias)}</text>
   {Array.from({length:14},(_,i)=><text key={i} x={369+i*3.3} y="160" fill={valueColor(sum)} fontSize="7" textAnchor="middle" dominantBaseline="middle" aria-hidden="true">{symbol(sum)}</text>)}
   {Array.from({length:10},(_,row)=>Array.from({length:5},(_,col)=><text key={`${row}:${col}`} x={418+col*4.4} y={140+row*4.4} fontSize="7" textAnchor="middle" fill={result===0?material.muted:valueColor(result)} opacity={col===0||col===4?1:.6} aria-hidden="true">{activation==='identity'?'=':result===0?':':'#'}</text>))}
   <text x="427" y="122" textAnchor="middle" fill={material.secondary} fontSize="15">{gate}</text>
   {Array.from({length:20},(_,i)=><text key={i} x={445+i*4.3} y="160" fill={valueColor(result)} fontSize="8" textAnchor="middle" dominantBaseline="middle" aria-hidden="true">{symbol(result)}</text>)}
   <text x="516" y="133" textAnchor="middle" fill={material.secondary} fontSize="14">输出</text><text x="516" y="196" textAnchor="middle" fill={material.ink} fontSize="24">{fmt(result)}</text>
   <g fill={material.muted} fontSize="13"><text x="16" y="30">01 乘权重</text><text x="252" y="30">02 求和</text><text x="411" y="30">03 {activation==='threshold'?'判断':'激活'}</text></g>
  </svg>
  <div className={s.result}><span>求和 <output>{fmt(sum)}</output></span><span>{gate} <output>{fmt(result)}</output></span></div>
  <figcaption>字符沿实际输入路径汇入求和核心；先乘权重，加偏置，再经过出口。颜色按数值连续变化，数字始终保留。</figcaption>
 </figure>;
}
