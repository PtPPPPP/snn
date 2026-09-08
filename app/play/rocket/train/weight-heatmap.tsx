import {memo,useEffect,useMemo,useRef} from 'react';
import type {Policy} from '../../../../lib/rocket/physics.mjs';
import s from './network.module.css';
export function heatColor(value:number,limit:number){const stops=value<0?[[233,237,244],[93,217,220],[55,142,210],[72,71,170]]:[[233,237,244],[246,212,119],[239,138,89],[204,76,120]];const x=Math.min(1,Math.abs(value)/Math.max(limit,1e-12))*3,i=Math.min(2,Math.floor(x)),t=x-i;return `rgb(${stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*t)).join(',')})`;}
const panels=[{x:42,y:58,w:150,h:288},{x:242,y:58,w:288,h:288},{x:590,y:58,w:44,h:288}];
function WeightHeatmap({initial,current,next,inputs,progress,limit,playing,layer,node,source,onPick}:{initial:Policy;current:Policy;next:Policy;inputs:number[];progress:number;limit:number;playing:boolean;layer:number;node:number;source:number;onPick:(layer:number,node:number,source:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),svg=useRef<SVGSVGElement>(null);
 // Cache complete snapshots; each animation frame only composites three clipped regions.
 const textures=useMemo(()=>typeof document==='undefined'?[]:[current,next].map(model=>{const bitmap=document.createElement('canvas');bitmap.width=1460;bitmap.height=820;const ctx=bitmap.getContext('2d')!;ctx.scale(2,2);
  panels.forEach((p,l)=>{const cols=l===0?7:l===1?128:1;const field=document.createElement('canvas');field.width=cols;field.height=128;const ink=field.getContext('2d')!;
   for(let r=0;r<128;r++)for(let c=0;c<cols;c++){const j=l===2?0:r,i=l===2?r:c;ink.fillStyle=heatColor(model.layers[l].weight[j][i]-initial.layers[l].weight[j][i],limit);ink.fillRect(c,r,1,1);}
   ctx.save();ctx.beginPath();ctx.rect(p.x,p.y,p.w,p.h);ctx.clip();ctx.fillStyle=heatColor(0,limit);ctx.fillRect(p.x,p.y,p.w,p.h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(field,p.x,p.y,p.w,p.h);ctx.restore();
  });return bitmap;
 }),[initial,current,next,limit]);
 const phase=progress<.375?0:progress<.75?1:2;
 const stage=phase===0?progress/.375*3:phase===1?(progress-.375)/.375*3:(progress-.75)/.25*3;
 const active=Math.min(2,Math.floor(stage)),activePanel=phase===0?active:2-active,local=stage-active;
 const sweep=Math.min(1,local/.7),bridge=active<2&&local>.7?(phase===0?active:1-active):-1,transfer=Math.max(0,(local-.7)/.3);
 const targetPanel=panels[activePanel],columnCount=activePanel===0?7:activePanel===1?128:1;
 const cellIndex=Math.min(columnCount*128-1,Math.floor(sweep*columnCount*128));
 const updatingColumn=Math.floor(cellIndex/128),updatingRow=cellIndex%128;
 const targetJ=activePanel===2?0:updatingRow,targetI=activePanel===2?updatingRow:updatingColumn;
 const targetX=targetPanel.x+(updatingColumn+.5)*targetPanel.w/columnCount,targetY=58+(updatingRow+.5)*288/128;
 const updateLinks=phase!==0&&local<.7?Array.from({length:activePanel===0?128:1},(_,k)=>{
  const sourcePanel=panels[activePanel+1];
  const sourceRow=activePanel===1?targetJ:k,sourceCol=activePanel===0?targetJ:0;
  return {k,sourceRow,sourceCol,x1:sourcePanel?sourcePanel.x+(sourceCol+.5)*sourcePanel.w/(activePanel===0?128:1):688,y1:sourcePanel?58+(sourceRow+.5)*288/128:202,value:activePanel<2?current.layers[activePanel+1].weight[activePanel===1?0:k][targetJ]:0};
 }):[];
 useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(!ctx)return;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1460,820);ctx.drawImage(textures[0],0,0);ctx.scale(2,2);
  if(phase===2)panels.forEach((p,l)=>{const fraction=Math.max(0,Math.min(1,(stage-(2-l))/.7));
   if(fraction===0)return;
   const cols=l===0?7:l===1?128:1,total=fraction*cols*128,complete=Math.floor(total),column=Math.floor(complete/128),row=complete%128,cw=p.w/cols,ch=p.h/128;
   ctx.save();ctx.beginPath();ctx.rect(p.x,p.y,column*cw,p.h);if(column<cols)ctx.rect(p.x+column*cw,p.y,cw,row*ch);ctx.clip();ctx.drawImage(textures[1],0,0,730,410);ctx.restore();
   if(column<cols){ctx.save();ctx.globalAlpha=total-complete;ctx.beginPath();ctx.rect(p.x+column*cw,p.y+row*ch,cw,ch);ctx.clip();ctx.drawImage(textures[1],0,0,730,410);ctx.restore();}

  });
 },[textures,phase,stage]);
 function pick(x:number,y:number){const matrix=svg.current?.getScreenCTM();if(!matrix)return;const q=new DOMPoint(x,y).matrixTransform(matrix.inverse());const l=panels.findIndex(p=>q.x>=p.x&&q.x<=p.x+p.w&&q.y>=p.y&&q.y<=p.y+p.h);if(l<0)return;const p=panels[l],r=Math.min(127,Math.max(0,Math.floor((q.y-p.y)/p.h*128))),c=Math.min(l===0?6:127,Math.max(0,Math.floor((q.x-p.x)/p.w*(l===0?7:128))));onPick(l+1,l===2?0:r,l===2?r:c);}
 const p=panels[Math.max(0,layer-1)],cols=layer===1?7:layer===2?128:1,r=layer===3?source:node,c=layer===3?0:Math.min(source,cols-1),cw=p.w/cols,ch=p.h/128;
 return <div className={s.heatViewport} data-playing={playing}><svg ref={svg} viewBox="-108 0 838 410" role="group" aria-label="完整权重热力图，颜色为相对初始化的真实改变量">
 <g fontSize="10" fill="#435b70"><text x="-48" y="24" textAnchor="middle">7 个输入</text><text x="-48" y="42" textAnchor="middle" fontSize="8" fill="#8795a8">送入网络的标准化数值</text>{['高度','速度','燃料','实际推力','刹车能力','燃料储备','安全速度'].map((name,i)=><g key={name} data-training-input={i}><circle cx="18" cy={58+(i+.5)/7*288} r="3" fill="#f5f7fa" stroke="#64849d"/><text x="7" y={55+(i+.5)/7*288} textAnchor="end">{name}</text><text x="7" y={67+(i+.5)/7*288} textAnchor="end" fontSize="8" fill="#7e8c9f">{inputs[i]?.toFixed(3)}</text></g>)}</g>
 <g fontSize="12" fill="#435b70" textAnchor="middle"><text x="117" y="24">输入 → 第一隐藏层</text><text x="386" y="24">第一层 → 第二隐藏层</text><text x="612" y="24">输出权重</text></g>
 <foreignObject x="0" y="0" width="730" height="410" pointerEvents="none"><canvas ref={canvas} width="1460" height="820" style={{width:730,height:410}}/></foreignObject>
 {panels.map((p,l)=><g key={l}><rect x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke="#d4dce8"/><rect data-heat-layer={l+1} x={p.x} y={p.y} width={p.w} height={p.h} fill="transparent" style={{touchAction:'none',cursor:'crosshair'}} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pick(e.clientX,e.clientY);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))pick(e.clientX,e.clientY);}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}/></g>)}
 <g pointerEvents="none" data-animation-phase={phase}>
  {panels.map((panel,l)=><rect key={l} x={panel.x-3} y={panel.y-3} width={panel.w+6} height={panel.h+6} fill="none" stroke={phase===0?'#378ed2':phase===1?'#a77ab9':'#d57b66'} strokeWidth={l===activePanel?.7:0} opacity=".4"/>)}
  {updateLinks.length>0&&<g data-update-curves={activePanel}>
   {activePanel===2&&<g><circle cx="688" cy="202" r="17" fill="#f4f0f7" stroke="#b09abd"/><text x="688" y="198" textAnchor="middle" fontSize="8" fill="#7656a6">策略</text><text x="688" y="209" textAnchor="middle" fontSize="8" fill="#7656a6">损失</text></g>}
   {updateLinks.map(({k,sourceRow,sourceCol,x1,y1,value})=>{
    const d=`M ${x1} ${y1} C ${x1-30} ${y1}, ${targetX+30} ${targetY}, ${targetX} ${targetY}`,color=value>=0?'#b77558':'#4f8198';
    return <g key={k} data-chain-source-row={sourceRow} data-chain-source-col={sourceCol} data-chain-target-row={targetJ} data-chain-target-col={targetI} data-chain-layer={activePanel}>
     <title>{activePanel===2?`策略损失 → 输出权重[1, ${targetI+1}]`:`W${activePanel+2}[${activePanel===1?1:k+1}, ${targetJ+1}] → W${activePanel+1}[${targetJ+1}, ${targetI+1}]；梯度链中的连接，不是单独决定更新`}</title>
     <path d={d} fill="none" stroke={color} strokeWidth=".7" opacity={activePanel===0?.08:.5}/>
     <path d={d} fill="none" stroke={color} strokeWidth="1" pathLength="100" strokeDasharray="14 86" strokeDashoffset={14-((sweep*3)%1)*114} opacity={activePanel===0?.12:.85}/>
     {activePanel<2&&<rect data-chain-source-cell x={x1-(activePanel===0?panels[1].w/128:panels[2].w)/2} y={y1-288/256} width={activePanel===0?panels[1].w/128:panels[2].w} height={288/128} fill="none" stroke={color} strokeWidth=".5" opacity=".5"/>}
    </g>;
   })}
   <rect data-update-cell x={targetX-targetPanel.w/columnCount/2} y={targetY-288/256} width={targetPanel.w/columnCount} height={288/128} fill="none" stroke="#684789" strokeWidth="1.3"/>
   <circle cx={targetX} cy={targetY} r="3.5" fill="none" stroke="#684789" strokeWidth=".8"/>
   <text x="386" y="387" textAnchor="middle" fontSize="9" fill="#7656a6">{`当前 W${activePanel+1}[${targetJ+1}, ${targetI+1}] · ${current.layers[activePanel].weight[targetJ][targetI].toFixed(4)} → ${next.layers[activePanel].weight[targetJ][targetI].toFixed(4)}`}</text>
  </g>}
  <line data-scan-line x1={targetPanel.x+sweep*targetPanel.w} x2={targetPanel.x+sweep*targetPanel.w} y1={58} y2={346} stroke={phase===0?'#378ed2':phase===1?'#a77ab9':'#d57b66'} strokeWidth="10" opacity=".09"/>
  <line data-scan-line x1={targetPanel.x+sweep*targetPanel.w} x2={targetPanel.x+sweep*targetPanel.w} y1={58} y2={346} stroke={phase===0?'#378ed2':phase===1?'#a77ab9':'#d57b66'} strokeWidth="1"/>
  {[0,1].map(l=><g key={l} data-flow-bridge={l} data-flow-active={bridge===l}>{[-1,0,1].map((lane)=>{const x1=panels[l].x+panels[l].w+4,x2=panels[l+1].x-4,y=202+lane*19,d=`M ${x1} ${y} C ${(x1+x2)/2} ${y+lane*9}, ${(x1+x2)/2} ${y-lane*9}, ${x2} ${y}`;return <g key={lane}><path d={d} fill="none" stroke="#ccd4df" strokeWidth=".7" opacity=".45"/>{bridge===l&&<><path d={d} fill="none" stroke={phase===0?'#378ed2':'#a77ab9'} strokeWidth="5" opacity=".12"/><path d={d} fill="none" stroke={phase===0?'#378ed2':'#a77ab9'} strokeWidth="1.6" pathLength="100" strokeDasharray="22 78" strokeDashoffset={phase===0?22-transfer*122:-100+transfer*122} strokeLinecap="round"/></>}</g>;})}</g>)}
  <text x="386" y="44" textAnchor="middle" fontSize="10" fill="#7656a6">{phase===0?'前向计算：输入 → 隐藏层 → 输出':phase===1?'飞行反馈 → 策略损失 → 梯度反向传递':'展开权重变化：输出层 → 第二隐藏层 → 第一隐藏层'}</text>
 </g>
 {layer>0&&<rect data-selected-weight x={p.x+c*cw} y={p.y+r*ch} width={cw} height={ch} fill="none" stroke="#263241" strokeWidth="1.4" pointerEvents="none"/>}
 <g fontSize="10" fill="#6b7d8e" textAnchor="middle"><text x="117" y="373">128 × 7 · 896 个权重</text><text x="386" y="373">128 × 128 · 16,384 个权重</text><text x="612" y="373">128 个权重</text><text x="386" y="400">曲线表示真实梯度依赖；第一隐藏层汇合后层 128 项 · 逐格顺序为教学演示</text></g>
 </svg></div>;
}
export default memo(WeightHeatmap);
