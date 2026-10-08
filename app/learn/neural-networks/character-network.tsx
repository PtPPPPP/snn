import { material } from '../../../lib/design/tokens';
import { valueColor } from '../../../lib/design/value-color';
import { morphSample, exactStage } from '../../../lib/learning/nonlinear-space';
import { formatClassifierNumber as fmt } from '../../../lib/learning/classifier-lesson';
import s from './classifier-lesson.module.css';
import {NeuronUnit} from './neuron-unit';

type Point = { x: number; y: number };
function GlyphLink({ from, to, value, weight, labelSide = 1, labelAt = .5 }: { from: Point; to: Point; value: number; weight: number; labelSide?: number; labelAt?: number }) {
  const start = { x: from.x, y: from.y + 24 }, end = { x: to.x, y: to.y - 28 };
  const at = (t: number) => {
    const k = t * t * (3 - 2 * t);
    return { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * t };
  };
  const contribution = value * weight, color = valueColor(contribution), label = at(labelAt);
  return <g data-character-connection data-value={contribution}>
    <title>{`${fmt(value)} × ${fmt(weight)} = ${fmt(contribution)}。字符与颜色表示本路加权贡献。`}</title>
    {Array.from({ length: 36 }, (_, i) => { const p = at((i + .5) / 36); return <text key={i} x={p.x} y={p.y} fill={color} fontSize="8" textAnchor="middle" dominantBaseline="middle" aria-hidden="true">{contribution === 0 ? ':' : contribution > 0 ? '+' : '−'}</text>; })}
    <rect x={label.x + labelSide * 7 - (labelSide < 0 ? 50 : 0)} y={label.y - 10} width="50" height="20" fill={material.background}/>
    <text x={label.x + labelSide * 8} y={label.y + 4} textAnchor={labelSide < 0 ? 'end' : 'start'} fill={material.secondary} fontSize="14">× {fmt(weight)}</text>
  </g>;
}
function GlyphNode({ x, y, value, label, operation }: Point & { value: number; label: string; operation?: string }) {
  const color = valueColor(value);
  return <g data-character-node data-value={value}>
    <title>{`${label} = ${fmt(value)}${operation ? '；' + operation : ''}`}</title>
    {Array.from({length:9},(_,r)=>Array.from({length:17},(_,c)=>{const row=r-4,col=c-8,width=8-Math.abs(row)*.7;if(Math.abs(col)>width||Math.abs(row)<1.4&&Math.abs(col)<6.5)return null;const edge=Math.abs(col)>width-1||Math.abs(row)>3;return <text key={`${r}:${c}`} x={x+col*5.2} y={y+row*5.4} fontSize="7" fill={edge?material.wire:color} opacity={edge ? .8 :.35+Math.min(1,Math.abs(value)/2)*.65} textAnchor="middle" dominantBaseline="middle" aria-hidden="true">{edge?':':value===0?':':value>0?'+':'−'}</text>;}))}
    <text x={x} y={y + 5} fill={material.ink} textAnchor="middle" fontSize="16">{label} {fmt(value)}</text>
    {operation && <text x={x} y={y + 41} fill={material.secondary} textAnchor="middle" fontSize="14">{operation}</text>}
  </g>;
}

/** Same model snapshot as the score surface. No invented branches or decorative animated signals. */
export function CharacterNetwork({ position, x, y, compact = false }: { position: number; x: number; y: number; compact?: boolean }) {
  const v = morphSample(x, y, position), stage = exactStage(position);
  const inputs = [{ x: 88, y: 35 }, { x: 272, y: 35 }], hidden = [{ x: 58, y: 177 }, { x: 180, y: 177 }, { x: 302, y: 177 }], output = { x: 180, y: stage === 0 ? 191 : 330 };
  const activation = stage === 2 ? 'ReLU' : stage === 1 ? '直接传递' : '显示过渡';
  return <figure className={s.networkFigure}>
    <figcaption>{stage === 0 ? '2 个输入 · 1 个分类单元' : '2 个输入 · 3 个隐藏单元 · 1 个输出单元'}</figcaption>
    <svg viewBox={`0 0 360 ${stage === 0 ? 256 : 398}`} role="img" aria-label={`同一个点的字符计算图，最终分数 ${fmt(v.score)}。先乘权重，再加偏置，最后激活。`} style={{ fontFamily: 'var(--opening-mono)' }}>
      {stage === 0 ? inputs.map((p, i) => <GlyphLink key={i} from={p} to={output} value={i ? y : x} weight={1} labelSide={i ? 1 : -1}/>) : <>
        <GlyphLink from={inputs[0]} to={hidden[0]} value={x} weight={1} labelSide={-1}/>
        <GlyphLink from={inputs[1]} to={hidden[1]} value={y} weight={1} labelSide={-1}/>
        <GlyphLink from={inputs[0]} to={hidden[2]} value={x} weight={1} labelSide={-1} labelAt={.28}/>
        <GlyphLink from={inputs[1]} to={hidden[2]} value={y} weight={1}/>
        {hidden.map((p, i) => <GlyphLink key={i} from={p} to={output} value={v.h[i]} weight={i === 2 ? -2 : 1} labelSide={i ? 1 : -1}/>)}
      </>}
      <GlyphNode {...inputs[0]} value={x} label="x₁"/><GlyphNode {...inputs[1]} value={y} label="x₂"/>
      {stage !== 0 && hidden.map((p, i) => <GlyphNode key={i} {...p} value={v.h[i]} label={`h${i + 1}`} operation={i < 2 ? '直接传递' : activation}/>)}
      {stage !== 0 && <text x="302" y="144" textAnchor="middle" fill={material.secondary} fontSize="14">a₃={fmt(x + y - 1)}</text>}
      <GlyphNode {...output} value={v.score} label="s" operation="求和 · b=−0.5"/>
    </svg>
    {!compact && <p>{stage === 0 ? '两路输入分别乘权重 1，再相加并加偏置 −0.5。当前没有隐藏层。' : <>h₁=x₁、h₂=x₂ 直接传递；第三路先相加并加 b₃=−1，再{stage === 2 ? '经过 ReLU' : stage === 1 ? '直接传递' : '显示计算过渡'}。零权重通路省略。</>}线旁是固定权重；线的字符与颜色表示乘权重后的贡献。</p>}
    {!compact && stage !== 0 && <p>输入→隐藏权重为 (1,0)、(0,1)、(1,1)，偏置为 (0,0,−1)；隐藏→输出权重为 (1,1,−2)，输出偏置 −0.5。此处所有数值与分数面使用同一计算。</p>}
    {!compact && <>
      <h4 style={{margin:'24px 0 14px',fontSize:16,fontWeight:500}}>{stage===0?'把一个神经元展开看':'展开 h₃：在同一个神经元里看求和与激活'}</h4>
      <NeuronUnit inputs={[{label:'x₁',value:x,weight:1},{label:'x₂',value:y,weight:1}]} bias={stage===0?-.5:-1} activation={stage===0?'threshold':stage===2?'relu':stage===1?'identity':'transition'} output={stage===0?v.predicted:v.h[2]}/>
    </>}
  </figure>;
}
