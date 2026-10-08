"use client";
import {memo,useMemo} from 'react';
import {renderFold} from '../../../lib/learning/ascii-fold';
import s from './opening-demo.module.css';
function Surface({columns,className}:{columns:number;className:string}){
 const mesh=useMemo(()=>renderFold(columns),[columns]);
 return <svg className={className} viewBox={`0 0 ${mesh.width} ${mesh.height}`} role="img" aria-label="由真实曲面投影和法线光照生成的 ASCII 折叠曲面，概念示意而非训练结果" data-ascii-fold>
  <g fontFamily="'Geist Mono',monospace" fontSize={mesh.fontSize} xmlSpace="preserve" style={{fontVariantLigatures:'none'}}>{mesh.runs.map((run,i)=><text key={i} x={run.x} y={run.y} fill={`rgb(${run.light} ${run.light} ${run.light-3})`} textLength={run.text.length*mesh.cellWidth} lengthAdjust="spacingAndGlyphs">{run.text}</text>)}</g>
  <g fill="none" stroke="var(--opening-wire)" strokeWidth="1" vectorEffect="non-scaling-stroke">{mesh.paths.map((d,i)=><path key={i} d={d}/>)}</g>
  {mesh.corners.map((p,i)=><rect key={i} x={p.x-3} y={p.y-3} width="6" height="6" fill="var(--opening-ink)"/>)}
 </svg>;
}
export default memo(function AsciiFold(){return <div className={s.fold}><Surface columns={94} className={s.foldDesktop}/><Surface columns={60} className={s.foldMobile}/></div>;});
