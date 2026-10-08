import {CORNERS,morphSample,morphCoordinates,morphIntersections} from '../../../lib/learning/nonlinear-space';
import {formatClassifierNumber as fmt} from '../../../lib/learning/classifier-lesson';
import {valueColor} from '../../../lib/design/value-color';
import s from './classifier-lesson.module.css';
export function InputClassificationMap({position,selected}:{position:number;selected:string}){
 const at=(x:number,y:number)=>({x:50+220*x,y:250-220*y});
 return <svg viewBox="0 0 320 290" className={s.inputMap} role="img" aria-label="原始输入平面上的分类区域。坐标和真实类别不动，边界随当前计算变化。">
  {Array.from({length:25},(_,row)=>Array.from({length:25},(_,col)=>{const x=(col+.5)/25,y=(row+.5)/25,p=at(x,y),prediction=morphSample(x,y,position).predicted;return <g key={`${row}:${col}`}><rect x={p.x-4.5} y={p.y-4.5} width="9" height="9" fill={prediction?'#383831':'#1e1e1c'}/><text x={p.x} y={p.y+2} fontSize="6" textAnchor="middle" fill={valueColor(morphSample(x,y,position).score)}>{prediction?'+':':'}</text></g>;}))}
  <path d="M50 20V250H282" fill="none" stroke="var(--opening-muted)"/>
  {morphIntersections(position).map((line,i)=>{const a=at(line[0][0],line[0][1]),b=at(line[1][0],line[1][1]);return Math.hypot(a.x-b.x,a.y-b.y)<1e-7?<circle key={i} cx={a.x} cy={a.y} r="8" fill="none" stroke="var(--opening-ink)" strokeWidth="1.5"/>:<path key={i} d={`M${a.x},${a.y}L${b.x},${b.y}`} stroke="var(--opening-ink)" strokeWidth="2.3"/>;})}
  {CORNERS.map(point=>{const p=at(point.x,point.y),v=morphSample(point.x,point.y,position);return <g key={point.id}>{selected===point.id&&<circle cx={p.x} cy={p.y} r="12" fill="none" stroke="var(--opening-ink)"/>}<rect x={p.x-5} y={p.y-5} width="10" height="10" fill={point.label?'#eee':'#151515'} stroke="var(--opening-secondary)" strokeWidth="2"/><text x={p.x+(point.x?12:-12)} y={p.y+4} textAnchor={point.x?'start':'end'} fill="var(--opening-ink)" fontSize="13">{v.predicted===point.label?'✓':'×'}</text></g>;})}
  <g fill="var(--opening-secondary)" fontSize="13"><text x="42" y="270">0</text><text x="267" y="270">1</text><text x="30" y="30">1</text><text x="282" y="266">x₁</text><text x="24" y="17">x₂</text></g>
 </svg>;
}
export function ReluFunction({position,x,y}:{position:number;x:number;y:number}){
 const a=x+y-1,h=Math.max(0,a),q=morphCoordinates(x,y,position)[2],at=(u:number,v:number)=>({x:160+100*u,y:145-100*v}),path=(values:number[][])=>values.map(([u,v],i)=>{const p=at(u,v);return `${i?'L':'M'}${p.x},${p.y}`;}).join(' '),display=(v:number)=>position<=1?position*v:v+(position-1)*(Math.max(0,v)-v),p=at(a,q),target=at(a,h);
 return <figure className={s.reluFigure}><figcaption>ReLU 函数：输入 a，输出 max(0,a)</figcaption><svg viewBox="0 0 320 260" role="img" aria-label={`选中点第三单元 a3=${a}，真正 ReLU 输出 ${h}；当前显示插值 ${fmt(q)}。`}><path d="M40 145H285M160 245V20" stroke="#64645d" fill="none"/><path d={path([[-1,0],[0,0],[1,1]])} stroke="#eee" strokeWidth="2.5" fill="none"/>{position!==2&&<path d={path([[-1,display(-1)],[0,0],[1,display(1)]])} stroke="var(--opening-muted)" strokeDasharray="4 4" strokeWidth="1.4" fill="none"/>}<circle cx={target.x} cy={target.y} r="7" fill="var(--opening-bg)" stroke="#eee" strokeWidth="1.5"/><rect x={p.x-3} y={p.y-3} width="6" height="6" fill="#eee"/><g fill="var(--opening-secondary)" fontSize="13"><text x="285" y="164">a</text><text x="169" y="24">输出</text><text x="51" y="163">−1</text><text x="164" y="164">0</text><text x="256" y="163">1</text><text x="140" y="49">1</text><text x="133" y="247">−1</text></g></svg><p>a₃ = {a}；真实 ReLU 输出 = {h}。{position!==2?`小实心点是当前插值 ${fmt(q)}，空心圈是真实 ReLU 端点。虚线只帮助看过渡。`:'现在显示的就是真实 ReLU。'}</p></figure>;
}
export { CharacterNetwork as SmallNetwork } from './character-network';
