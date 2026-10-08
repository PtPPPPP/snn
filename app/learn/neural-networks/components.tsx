"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { decisionLogit, forward, hasMeaningfulBoundary, parameterName, type Example, type Network, type Trace } from '../../../lib/learning/foundations';
import s from './learning.module.css';

export const number = (value: number, digits = 3) => Math.abs(value) < .0005 ? '0.000' : value.toFixed(digits);
export const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(3)}`;
export type Selection = { layer: 'hidden' | 'output'; index: number };
export type HistoryPoint = { step: number; loss: number };
const positive = '#416582', negative = '#91612d';

export function SectionHeading({ number: n, title, aside }: { number: string; title: string; aside?: ReactNode }) {
  return <div className={s.sectionHeading}><h2><span>{n}</span>{title}</h2>{aside && <div>{aside}</div>}</div>;
}

export function ParameterControl({ label, value, onChange, description }: { label: string; value: number; onChange: (value: number) => void; description: string }) {
  const limit = Math.max(3, Math.ceil(Math.abs(value)));
  return <label className={s.parameter}><span>{label}<small>{description}</small></span><div><input type="range" aria-label={`${label} 滑块`} min={-limit} max={limit} step=".01" value={value} onChange={e => onChange(Number(e.target.value))}/><input type="number" aria-label={`${label} 数值`} min={-20} max={20} step=".01" value={Number(value.toFixed(3))} onChange={e => { const next = e.target.valueAsNumber; if (Number.isFinite(next)) onChange(Math.max(-20, Math.min(20, next))); }}/></div></label>;
}

const plot = { x: 30, y: 16, size: 306 };
const px = (x: number) => plot.x + (x + 1) / 2 * plot.size;
const py = (y: number) => plot.y + (1 - y) / 2 * plot.size;

export function DecisionField({ model, data, selected, onSelect }: { model: Network; data: Example[]; selected: number; onSelect: (id: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const count = 58, unit = plot.size / count;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, 360, 360);
    const values = Array.from({ length: count + 1 }, (_, row) => Array.from({ length: count + 1 }, (_, col) => decisionLogit(model, [col / count * 2 - 1, 1 - row / count * 2])));
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
      const value = forward(model, [(col + .5) / count * 2 - 1, 1 - (row + .5) / count * 2]).probability;
      const low = [232, 218, 194], high = [194, 217, 234];
      ctx.fillStyle = `rgb(${low.map((v, i) => Math.round(v + (high[i] - v) * value)).join(',')})`;
      ctx.fillRect(plot.x + col * unit, plot.y + row * unit, unit + .5, unit + .5);
    }
    ctx.beginPath();
    for (let row = 0; hasMeaningfulBoundary(model) && row < count; row++) for (let col = 0; col < count; col++) {
      const z = [values[row][col], values[row][col + 1], values[row + 1][col + 1], values[row + 1][col]];
      const corners = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]];
      const crossing: number[][] = [];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        if ((z[i] >= 0) === (z[j] >= 0)) continue;
        const t = z[i] / (z[i] - z[j]);
        crossing.push([plot.x + (corners[i][0] + t * (corners[j][0] - corners[i][0])) * unit, plot.y + (corners[i][1] + t * (corners[j][1] - corners[i][1])) * unit]);
      }
      for (let i = 0; i + 1 < crossing.length; i += 2) { ctx.moveTo(...crossing[i] as [number, number]); ctx.lineTo(...crossing[i + 1] as [number, number]); }
    }
    ctx.strokeStyle = '#465668'; ctx.lineWidth = 1.8; ctx.stroke();
  }, [model]);
  return <div className={s.field}>
    <canvas ref={canvas} width="720" height="720" aria-hidden="true"/>
    <svg viewBox="0 0 360 360" role="group" aria-label="二维样本与实际模型分类边界">
      {[-1, -.5, 0, .5, 1].map(t => <g key={t}><path d={`M${px(t)} ${plot.y}V${plot.y + plot.size}M${plot.x} ${py(t)}H${plot.x + plot.size}`} className={t === 0 ? s.axis : s.grid}/><text x={px(t)} y="340" textAnchor="middle" className={s.axisLabel}>{t}</text>{t !== 1 && <text x="22" y={py(t) + 4} textAnchor="end" className={s.axisLabel}>{t}</text>}</g>)}
      <text x="336" y="355" className={s.axisLabel}>x₁</text><text x="14" y="12" className={s.axisLabel}>x₂</text>
      {data.map(point => {
        const wrong = forward(model, point.x).prediction !== point.target;
        return <g key={point.id} role="button" tabIndex={0} aria-label={`样本 ${point.id + 1}，坐标 ${point.x.map(v => v.toFixed(2)).join('，')}，类别 ${point.target}${wrong ? '，当前分错' : '，当前分对'}`} aria-pressed={selected === point.id} className={s.dataPoint} onClick={() => onSelect(point.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(point.id); } }}>
          <circle cx={px(point.x[0])} cy={py(point.x[1])} r={10} fill="transparent"/>
          {selected === point.id && <circle cx={px(point.x[0])} cy={py(point.x[1])} r="10" fill="none" stroke="var(--text-primary)" strokeWidth="1.3"/>}
          {point.target === 1 ? <circle cx={px(point.x[0])} cy={py(point.x[1])} r="4.5" fill={positive} stroke="var(--surface-1)" strokeWidth="1.1"/> : <rect x={px(point.x[0]) - 4} y={py(point.x[1]) - 4} width="8" height="8" fill={negative} stroke="var(--surface-1)" strokeWidth="1.1"/>}
          {wrong && <path d={`M${px(point.x[0]) - 2} ${py(point.x[1]) - 2}l4 4m0 -4l-4 4`} stroke="#fcfcfd" strokeWidth="1.1"/>}
        </g>;
      })}
    </svg>
  </div>;
}

export function NetworkDiagram({ model, trace, selection, onSelect, backward }: { model: Network; trace: Trace; selection: Selection; onSelect: (selection: Selection) => void; backward: boolean }) {
  const hidden = model.kind === 'mlp';
  const inputX = 48, hiddenX = 185, outputX = 326;
  const inputY = [110, 254], hiddenY = [68, 144, 220, 296], outputY = 182;
  const p = model.parameters;
  function connection(x1: number, y1: number, x2: number, y2: number, weight: number, active: boolean, id: string) {
    return <path key={id} d={`M${x1 + 22} ${y1}C${(x1 + x2) / 2} ${y1},${(x1 + x2) / 2} ${y2},${x2 - 24} ${y2}`} stroke={weight >= 0 ? positive : negative} strokeWidth={.7 + Math.min(2, Math.abs(weight))} opacity={active ? .85 : .18} fill="none" strokeDasharray={backward && active ? '4 5' : undefined}><title>{id} = {signed(weight)}</title></path>;
  }
  function neuron(x: number, y: number, label: string, value: number, next: Selection) {
    const active = selection.layer === next.layer && selection.index === next.index;
    return <g key={label} role="button" tabIndex={0} aria-label={`查看${label}，输出 ${number(value)}`} aria-pressed={active} className={s.neuron} onClick={() => onSelect(next)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(next); } }}>
      <circle cx={x} cy={y} r="27" fill="transparent"/>
      <circle cx={x} cy={y} r="24" fill={active ? 'var(--accent-soft)' : 'var(--surface-1)'} stroke={active ? 'var(--accent)' : 'var(--border-active)'} strokeWidth={active ? 1.8 : 1}/>
      <text x={x} y={y + 4} textAnchor="middle" className={s.nodeValue}>{number(value, 2)}</text><text x={x} y={y + 42} textAnchor="middle" className={s.nodeLabel}>{label}</text>
    </g>;
  }
  return <svg viewBox="0 0 376 368" className={s.network} role="group" aria-label={hidden ? '两输入、四隐藏单元、一输出的真实网络' : '两输入、一个阈值输出的感知机'}>
    <text x={inputX} y="18" textAnchor="middle" className={s.columnLabel}>输入</text>{hidden && <text x={hiddenX} y="18" textAnchor="middle" className={s.columnLabel}>隐藏层</text>}<text x={outputX} y="18" textAnchor="middle" className={s.columnLabel}>输出</text>
    {hidden ? hiddenY.flatMap((y, j) => inputY.map((iy, k) => connection(inputX, iy, hiddenX, y, p[j * 2 + k], selection.layer === 'hidden' && selection.index === j, `w${j + 1}${k + 1}`))) : inputY.map((iy, k) => connection(inputX, iy, outputX, outputY, p[k], true, `w${k + 1}`))}
    {hidden && hiddenY.map((y, j) => connection(hiddenX, y, outputX, outputY, p[12 + j], selection.layer === 'output', `v${j + 1}`))}
    {inputY.map((y, i) => <g key={i}><rect x={inputX - 23} y={y - 23} width="46" height="46" rx="5" fill="var(--surface-2)" stroke="var(--border-default)"/><text x={inputX} y={y + 4} textAnchor="middle" className={s.nodeValue}>{number(trace.input[i], 2)}</text><text x={inputX} y={y + 42} textAnchor="middle" className={s.nodeLabel}>x{i === 0 ? '₁' : '₂'}</text></g>)}
    {hidden && hiddenY.map((y, j) => neuron(hiddenX, y, `h${j + 1}`, trace.hidden[j], { layer: 'hidden', index: j }))}
    {neuron(outputX, outputY, hidden ? 'p' : '类别', trace.probability, { layer: 'output', index: 0 })}
    <text x="188" y="359" textAnchor="middle" className={s.nodeCaption}>{hidden ? `${model.activation === 'tanh' ? 'tanh' : '线性'} 隐藏层 · sigmoid 输出` : '加权求和 · z ≥ 0 时输出 1'}</text>
  </svg>;
}

export function ActivationPlot({ value, activation }: { value: number; activation: 'tanh' | 'linear' | 'sigmoid' | 'threshold' }) {
  const fn = (x: number) => activation === 'tanh' ? Math.tanh(x) : activation === 'linear' ? x : activation === 'threshold' ? Number(x >= 0) : 1 / (1 + Math.exp(-x));
  const yScale = activation === 'linear' ? 3 : 1.2;
  const x = (v: number) => 120 + v / 3 * 96, y = (v: number) => 64 - v / yScale * 44;
  const d = Array.from({ length: 121 }, (_, i) => { const z = -3 + i / 20; return `${i ? 'L' : 'M'}${x(z)},${y(fn(z))}`; }).join(' ');
  const within = Math.abs(value) <= 3;
  return <div className={s.activationPlot}><svg viewBox="0 0 240 126" role="img" aria-label={`${activation} 函数，当前输入 ${number(value)}，输出 ${number(fn(value))}`}><path d="M24 64H216M120 15V108" className={s.axis}/><path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.6"/>{within && <><path d={`M${x(value)} 64V${y(fn(value))}H120`} fill="none" stroke="var(--border-active)" strokeDasharray="3 3"/><circle cx={x(value)} cy={y(fn(value))} r="4" fill="var(--accent)"/></>}<text x="24" y="121" className={s.axisLabel}>−3</text><text x="206" y="121" className={s.axisLabel}>3</text><text x="223" y="68" className={s.axisLabel}>z</text></svg>{!within && <small>当前输入在图示范围之外：{number(value)}</small>}</div>;
}

export function LossPlot({ history, perceptron }: { history: HistoryPoint[]; perceptron: boolean }) {
  const max = Math.max(.05, ...history.map(p => p.loss)) * 1.12;
  const end = Math.max(1, history.at(-1)?.step ?? 0);
  const x = (value: number) => 42 + value / end * 298, y = (value: number) => 91 - value / max * 65;
  const path = history.map((p, i) => `${i ? 'L' : 'M'}${x(p.step)},${y(p.loss)}`).join(' ');
  const last = history.at(-1)!;
  return <svg viewBox="0 0 360 126" className={s.lossPlot} role="img" aria-label={`${perceptron ? '错分比例' : '平均交叉熵'}，第 ${last.step} 次更新，${last.loss.toFixed(4)}`}>
    <path d="M42 26H340M42 58H340M42 91H340" className={s.grid}/><text x="33" y="30" textAnchor="end" className={s.axisLabel}>{max.toFixed(2)}</text><text x="33" y="95" textAnchor="end" className={s.axisLabel}>0</text>
    <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6"/><circle cx={x(last.step)} cy={y(last.loss)} r="3" fill="var(--accent)"/>
    <text x="42" y="114" className={s.axisLabel}>0</text><text x="340" y="114" textAnchor="end" className={s.axisLabel}>{end} 次更新</text>
    {history.length === 1 && <text x="185" y="55" textAnchor="middle" className={s.axisLabel}>更新参数后，轨迹会出现在这里</text>}
  </svg>;
}

export function ContributionInspector({ model, trace, selection, onChange, gradient, sampleGradient, pending, previous, rate, showGradient, readOnly = false, gradientParameter }: { readOnly?: boolean; gradientParameter?: number; model: Network; trace: Trace; selection: Selection; onChange: (index: number, value: number) => void; gradient: number[] | null; sampleGradient: number[] | null; pending: boolean; previous: number[] | null; rate: number; showGradient: boolean }) {
  const [gradientChoice, setGradientChoice] = useState<number | null>(null);
  const hidden = model.kind === 'mlp' && selection.layer === 'hidden';
  const row = selection.index;
  const indices = model.kind === 'perceptron' ? [0, 1] : hidden ? [row * 2, row * 2 + 1] : [12, 13, 14, 15];
  const inputs = hidden || model.kind === 'perceptron' ? trace.input : trace.hidden;
  const bias = model.kind === 'perceptron' ? 2 : hidden ? 8 + row : 16;
  const sum = hidden ? trace.sums[row] : trace.logit;
  const activation = model.kind === 'perceptron' ? 'threshold' : hidden ? model.activation : 'sigmoid';
  const output = hidden ? trace.hidden[row] : trace.probability;
  const choices = [...indices, bias];
  const inspected = readOnly && gradientParameter !== undefined ? gradientParameter : gradientChoice !== null && choices.includes(gradientChoice) ? gradientChoice : indices[0];
  return <div className={s.inspectorContent}>
    <div className={s.contributionHead}><span>输入 × 权重</span><span>贡献</span></div>
    {indices.map((index, k) => <div key={index} className={s.contribution}><span><i>{hidden || model.kind === 'perceptron' ? `x${k + 1}` : `h${k + 1}`}</i>{number(inputs[k])} × ({number(model.parameters[index])})</span><b data-sign={inputs[k] * model.parameters[index] < 0 ? 'negative' : 'positive'}>{signed(inputs[k] * model.parameters[index])}</b></div>)}
    <div className={s.biasRow}><span>偏置 {parameterName(model, bias)}</span><b>{signed(model.parameters[bias])}</b></div>
    <div className={s.sumRow}><span>相加得到 z</span><strong>{number(sum)}</strong></div>
    <div className={s.activationHeading}><span>{activation === 'threshold' ? '硬阈值判断' : activation === 'linear' ? '直接传递' : `${activation} 激活`}</span><b>{number(output)}</b></div>
    <ActivationPlot value={sum} activation={activation}/>
    {readOnly ? <details className={s.details}><summary>本单元的参数（只读）</summary>{choices.map(index => <div className={s.biasRow} key={index}><span>{parameterName(model,index)}</span><b>{signed(model.parameters[index])}</b></div>)}</details> : <details className={s.details} open={model.kind === 'perceptron'}><summary>调整这个单元的参数</summary><div className={s.parameterList}>{[...indices, bias].map(index => <ParameterControl key={index} label={parameterName(model, index)} value={model.parameters[index]} description={index === bias ? '偏置' : '权重'} onChange={value => onChange(index, value)}/>)}</div><p>滑块范围用于方便探索，不是参数的理论限制。手动修改会重新记录训练轨迹。</p></details>}
    {showGradient && <section className={s.gradientPanel} aria-label="梯度与参数更新"><span className={s.eyebrow}>{pending ? '梯度已算好 · 参数未变' : previous ? '本次更新' : '准备求梯度'}</span><h3>{parameterName(model, inspected)} 怎样改变？</h3>{readOnly ? <p>当前跟踪参数：{parameterName(model,inspected)}</p> : <label className={s.inspectorSelect}>查看参数<select aria-label="查看梯度参数" value={inspected} onChange={e => setGradientChoice(Number(e.target.value))}>{choices.map(index => <option key={index} value={index}>{parameterName(model, index)}{index === bias ? " · 偏置" : " · 权重"}</option>)}</select></label>}{gradient ? <><dl><div><dt>所选样本的损失梯度</dt><dd>{sampleGradient ? signed(sampleGradient[inspected]) : '—'}</dd></div><div><dt>36 个样本的平均梯度</dt><dd>{signed(gradient[inspected])}</dd></div><div><dt>更新量 −η × 平均梯度</dt><dd>{signed(-rate * gradient[inspected])}</dd></div></dl><p className={s.updateEquation}>{number(previous?.[inspected] ?? model.parameters[inspected])} − {rate} × ({number(gradient[inspected])})<br/><strong>= {number((previous?.[inspected] ?? model.parameters[inspected]) - rate * gradient[inspected])}</strong></p></> : <p>点击“计算梯度”，查看当前参数附近，损失会往哪个方向变化。</p>}<p>{previous ? "这些梯度在更新前的参数处计算；上方前向数值属于更新后的模型。" : "梯度在当前参数处计算，应用更新前模型保持不变。"} 单个样本的梯度不等于整批平均梯度；显示值经过四舍五入。</p></section>}
  </div>;
}

export function TrainingTransport({ perceptron, playing, pending, complete, canTrain, steps, onPlay, onStep, onReset, rate, onRate }: { perceptron: boolean; playing: boolean; pending: boolean; complete: boolean; canTrain: boolean; steps: number; onPlay: () => void; onStep: () => void; onReset: () => void; rate: number; onRate: (rate: number) => void }) {
  return <div className={s.transport} aria-label="训练控制"><div className={s.transportActions}>
    {canTrain && <><button className={s.primaryButton} disabled={complete} onClick={onPlay}>{playing ? '暂停训练' : perceptron ? '自动修正' : '自动训练'}</button><button className={s.secondaryButton} disabled={complete || playing} onClick={onStep}>{perceptron ? '修正一个错分点' : pending ? '应用参数更新' : '计算梯度'}</button></>}
    <button className={s.quietButton} onClick={onReset}>重置实验</button>
  </div><div className={s.transportMeta}>{canTrain && <label>学习率 <select aria-label="学习率" value={rate} onChange={e => onRate(Number(e.target.value))}>{[.05, .1, .2, .5].map(v => <option key={v} value={v}>{v}</option>)}</select></label>}<span><b>{steps.toString().padStart(3, '0')}</b> 次参数更新</span></div></div>;
}
