import {memo,useMemo,useRef,useEffect,useState} from 'react';
import type {Policy} from '../../../../lib/rocket/physics.mjs';
import styles from './lesson.module.css';
type Trace={inputs:number[];activations:number[][];throttle:number};
const labels=['高度','速度','燃料','实际推力','刹车能力比较','燃料储备比较','安全速度比较'];
const p=(layer:number,i:number)=>layer<0?{x:110,y:78+i*45}:layer===2?{x:662,y:228}:{x:(layer===0?236:445)+i%8*16,y:83+Math.floor(i/8)*19};
function LessonNetwork({before,after,stage,inputValues,liveAll=false,selected,playing,model,onPick,allConnections=false,edgeSignals,nodeSignals,direction='forward',activeLayer,comparisonLabel='上一刻',signalLabel='输出端梯度',highlightConnection,nodeReferenceSignals,positiveColor='#315c80',negativeColor='#a77234'}:{before:Trace;after:Trace;stage:number;inputValues?:string[];liveAll?:boolean;selected:number;playing:boolean;model:Policy;onPick:(stage:number,i:number)=>void;allConnections?:boolean;edgeSignals?:Policy['layers'];nodeSignals?:number[][];direction?:'forward'|'backward';activeLayer?:number;comparisonLabel?:string;signalLabel?:string;positiveColor?:string;negativeColor?:string;nodeReferenceSignals?:number[][];highlightConnection?:{layer:number;source:number;target:number}}){
 const [expanded,setExpanded]=useState(false);
 const viewport=useRef<HTMLDivElement>(null);
 function toggleZoom(){
  const next=!expanded;setExpanded(next);
  requestAnimationFrame(()=>{const container=viewport.current,svg=container?.querySelector('svg');if(!container||!svg)return;const point=p(stage-1,selected),scale=svg.getBoundingClientRect().width/730;container.scrollTo({left:next?point.x*scale-container.clientWidth/2:0,behavior:'instant'});});
 }
 const edges=useMemo(()=>model.layers.map((layer,l)=>{
  const edges:{d:string;i:number;j:number;w:number}[]=[];
  layer.weight.forEach((row,j)=>row.forEach((w,i)=>{
   const visible=allConnections|| (stage===0?(l!==0||i===selected):(l<stage-1||(l===stage-1&&j===selected)));
   if(visible&&w!==0){const a=p(l-1,i),b=p(l,j),mid=(a.x+b.x)/2;edges.push({i,j,w,d:`M${a.x} ${a.y}C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`});}
  }));return edges;
 }),[model,stage,selected,allConnections]);
 const paths=useMemo(()=>edges.map((layer,l)=>{
  const inputs=l===0?after.inputs:after.activations[l-1];
  const ranked=layer.map(e=>{const v=edgeSignals?edgeSignals[l].weight[e.j][e.i]:inputs[e.i]*e.w;return {...e,negative:v<0,value:Math.abs(v)};}).sort((a,b)=>b.value-a.value);
  const max=ranked[0]?.value||1;
  // Relative to this layer's largest actual contribution; cap geometry, not calculation.
  const visible=ranked.filter(e=>e.value>=max*.08&&e.value>1e-8).slice(0,240);
  const buckets=Array.from({length:10},()=>[] as string[]);
  visible.forEach(e=>buckets[(e.negative?5:0)+Math.min(4,Math.floor(e.value/max*5))].push(e.d));
  return {count:layer.length,drawn:visible.length,buckets:buckets.map(b=>b.join(' ')),flow:[false,true].map(negative=>visible.slice(0,6).filter(e=>e.negative===negative).map(e=>e.d).join(' '))};
 }),[edges,after,edgeSignals]);
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const svg=canvas.current?.closest('svg');if(!svg)return;
  let selecting=false;
  const start=(e:TouchEvent)=>{selecting=e.touches.length===1&&(e.target as Element).closest('[data-touch-layer]')!==null;if(selecting)e.preventDefault();};
  const move=(e:TouchEvent)=>{if(selecting)e.preventDefault();};
  const end=()=>{selecting=false;};
  svg.addEventListener('touchstart',start,{passive:false});svg.addEventListener('touchmove',move,{passive:false});svg.addEventListener('touchend',end);svg.addEventListener('touchcancel',end);
  return()=>{svg.removeEventListener('touchstart',start);svg.removeEventListener('touchmove',move);svg.removeEventListener('touchend',end);svg.removeEventListener('touchcancel',end);};
 },[]);

 useEffect(()=>{
  const ctx=canvas.current?.getContext('2d');if(!ctx)return;
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,730,435);
  paths.forEach(path=>path.buckets.forEach((d,b)=>{
   if(!d)return;const depth=b%5;ctx.strokeStyle=(b>=5?negativeColor:positiveColor)+Math.round([.035,.07,.13,.23,.4][depth]*255).toString(16).padStart(2,'0');ctx.lineWidth=[.35,.45,.6,.8,1][depth];ctx.stroke(new Path2D(d));
  }));
 },[paths,positiveColor,negativeColor]);
 function pickAt(group:SVGGElement,l:number,x:number,y:number){const svg=group.ownerSVGElement,matrix=svg?.getScreenCTM();if(!matrix)return;const pt=new DOMPoint(x,y).matrixTransform(matrix.inverse());const col=Math.max(0,Math.min(7,Math.round((pt.x-(l===0?236:445))/16))),row=Math.max(0,Math.min(15,Math.round((pt.y-83)/19)));onPick(l+1,row*8+col);}
 return <><div className={styles.networkViewSwitch}><span>{expanded?'按住层滑选 · 层外横滑查看网络':'点选神经元 · 放大后可按住层滑选'}</span><div><button onClick={()=>onPick(3,0)} aria-pressed={stage===3}>全网推理</button><button onClick={toggleZoom} aria-pressed={expanded}>{expanded?'全网概览':'放大选点'}</button></div></div><div ref={viewport} className={styles.networkViewport} data-expanded={expanded} data-playing={playing} tabIndex={0} aria-label="推理网络图，可横向滚动"><svg viewBox="0 0 730 435" role="group" aria-label="完整7输入、128、128、1网络，比较相邻时刻的计算结果"><g>
  <path d="M122 227 H224 M363 227 H433 M572 227 H637" fill="none" stroke="#d6dce4" strokeWidth="2"/>
  <rect x="221" y="60" width="143" height="326" rx="5" fill={stage===1?'#edf3f8':'#f5f6f8'}/>
  <rect x="430" y="60" width="143" height="326" rx="5" fill={stage===2?'#edf3f8':'#f5f6f8'}/>
  <g fontSize="13" fill="#263241" textAnchor="middle"><text x="93" y="29">读入 7 个数</text><text x="292" y="29">第一组 / 128 个</text><text x="501" y="29">第二组 / 128 个</text><text x="662" y="180">{nodeSignals?signalLabel:'最后一个结果'}</text></g>
  <g fontSize="10" fill="#667181" textAnchor="middle"><text x="292" y="408">乘系数 → 相加 → 压缩</text><text x="501" y="408">乘系数 → 相加 → 压缩</text><text x="662" y="300">乘系数 → 相加</text></g>
  <foreignObject x="0" y="0" width="730" height="435" pointerEvents="none" aria-hidden="true"><canvas ref={canvas} width={1460} height={870} style={{width:730,height:435}}/></foreignObject>
  <g pointerEvents="none" aria-label="按当前贡献深浅显示，低贡献连线省略">
   {paths.map((path,l)=>path.count>0&&<g key={l} data-connection-layer={l} data-edge-count={path.count} data-drawn-count={path.drawn}>
    {path.flow.map((d,sign)=>d&&<path key={sign} d={d} stroke={sign===0?positiveColor:negativeColor} strokeWidth=".85" opacity=".32" fill="none" className={styles.connection} style={{animationDelay:`${-l*.3}s`,animationDirection:direction==='backward'?'reverse':'normal',opacity:activeLayer===undefined||activeLayer===l?.45:.04}}/>)}
   </g>)}
  </g>
  {highlightConnection&&(()=>{const {layer,source,target}=highlightConnection,a=p(layer-1,source),b=p(layer,target),mid=(a.x+b.x)/2,v=edgeSignals?.[layer].weight[target][source]??0;return <path data-selected-weight d={`M${a.x} ${a.y}C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`} fill="none" stroke={v>=0?positiveColor:negativeColor} strokeWidth="2" opacity=".9" pointerEvents="none"/>;})()}
  {after.inputs.map((v,i)=>{const point=p(-1,i),changed=Math.abs(v-before.inputs[i])>1e-7;return <g key={i} role="button" tabIndex={0} aria-label={`输入神经元：${labels[i]}`} onClick={()=>onPick(0,i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(0,i);}}}><rect x="0" y={point.y-17} width="127" height="36" fill="transparent"/>{stage===0&&selected===i&&<circle cx={point.x} cy={point.y} r="15" fill="none" stroke="#007f78" strokeWidth="2"/>}<text x="88" y={point.y-2} textAnchor="end" fontSize="11" fill={changed?'#315c80':'#667181'}>{labels[i]}</text><text x="88" y={point.y+11} textAnchor="end" fontSize="8" fill="#667181">{inputValues?.[i]??('换算后 '+v.toFixed(2))}</text><circle cx={point.x} cy={point.y} r="11" fill="none" stroke="#b8c0ca" strokeWidth="2"/><circle cx={point.x} cy={point.y} r="7" fill={allConnections?(v>=0?positiveColor:negativeColor):changed?'#315c80':'#b8c0ca'}/></g>;})}
  {after.activations.slice(0,2).map((values,l)=><g key={l} data-touch-layer={l+1} style={{touchAction:'none'}} onPointerDown={e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pickAt(e.currentTarget,l,e.clientX,e.clientY);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))pickAt(e.currentTarget,l,e.clientX,e.clientY);}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onClick={e=>e.stopPropagation()}>
   <rect x={l===0?221:430} y="60" width="143" height="326" fill="transparent"/>
   {values.map((v,i)=>{
   const point=p(l,i),old=before.activations[l][i],display=liveAll||stage>=l+1?v:old,isSelected=stage===l+1&&i===selected;
   const signal=nodeSignals?.[l]?.[i],scale=nodeSignals?Math.max(1e-12,...nodeSignals[l].map(Math.abs),...(nodeReferenceSignals?.[l]??[]).map(Math.abs)):1;
   return <g key={l+'-'+i} role="button" tabIndex={0} aria-label={`第${l+1}层神经元${i+1}`}  onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(l+1,i);}}}>
    <circle cx={point.x} cy={point.y} r={nodeReferenceSignals?2+Math.abs(nodeReferenceSignals[l][i])/Math.max(scale,...nodeReferenceSignals[l].map(Math.abs))*2.8:nodeSignals?5:4+Math.abs(old)*2} fill="none" stroke="#b9c2cd" strokeWidth="1.3"/>
    <circle className={styles.neuron} cx={point.x} cy={point.y} r={signal===undefined?2+Math.abs(display)*2.8:2+Math.abs(signal)/scale*2.8} fill={(signal??display)>=0?positiveColor:negativeColor} opacity={liveAll||stage>=l+1?.95:.38}/>
    {isSelected&&<circle cx={point.x} cy={point.y} r="8" fill="none" stroke="#007f78" strokeWidth="2"/>}
    <title>{signal===undefined?`神经元 ${i+1}：${old.toFixed(4)} → ${v.toFixed(4)}`:`神经元 ${i+1} · ${signalLabel}：${signal.toExponential(3)}`}</title>
   </g>;
  })}</g>)}
  <g role="button" tabIndex={0} aria-label="输出神经元：油门" onClick={()=>onPick(3,0)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(3,0);}}}>
  <circle cx="662" cy="228" r="27" fill="none" stroke="#b8c0ca" strokeWidth="3"/>
  <circle cx="662" cy="228" r="22" fill={nodeSignals?(nodeSignals[2][0]>=0?positiveColor:negativeColor):allConnections||stage===3?'#315c80':'#8591a2'}/>
  <text x="662" y="232" textAnchor="middle" fill="white" fontSize="12">{nodeSignals?nodeSignals[2][0].toExponential(1):(liveAll||stage===3?after:before).activations[2][0].toFixed(3)}</text>
  <text x="662" y="273" textAnchor="middle" fill="#667181" fontSize="9">{nodeSignals?'权重属于连线':`${comparisonLabel} ${before.activations[2][0].toFixed(3)}`}</text>
 </g></g></svg></div></>;
}

export default memo(LessonNetwork);
