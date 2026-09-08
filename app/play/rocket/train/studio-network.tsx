import { useEffect, useMemo, useRef, useState } from 'react';
import type { Policy } from '../../../../lib/rocket/physics.mjs';
import { boards, cellBox, dependencies, heat, hitCell, revealFor, type Cell } from './studio-model';
import s from './studio.module.css';

// Cull faint connections before constructing drawable paths. Data stays complete.
const MIN_CONTRIBUTION = .18;

export default function StudioNetwork({ initial, before, after, inputs, selected, focused, lossSelected, onLossSelect, phase, part, activeLayer, limit, terms, signals, activations, onSelect }: {
  initial: Policy; before: Policy; after: Policy; inputs: number[]; selected: Cell; focused:boolean; lossSelected:boolean; onLossSelect:()=>void;
  phase: number; part: number; activeLayer: number; limit: number; terms: number[]; signals:number[][]; activations:number[][]; onSelect: (cell: Cell) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), svg = useRef<SVGSVGElement>(null);
  const scroller=useRef<HTMLDivElement>(null);
  const [expanded,setExpanded]=useState(false);
  const connections=useMemo(()=>{
    if(typeof document==='undefined')return null;
    const image=document.createElement('canvas');image.width=1880;image.height=840;const ctx=image.getContext('2d')!;ctx.scale(2,2);
    const max=Math.max(1e-20,...before.layers.flatMap((l,k)=>l.weight.flatMap((r,j)=>r.map(w=>Math.abs(w*signals[k][j])))));
    const buckets=Array.from({length:32},()=>new Path2D());
    before.layers.forEach((l,layer)=>l.weight.forEach((row,j)=>row.forEach((weight,i)=>{
      const target=cellBox({layer,row:j,col:i}),previous=boards[layer-1];
      const sx=previous?previous.x+previous.w:104,sy=previous?previous.y+(i+.5)*previous.h/128:108+i*37,tx=target.x+target.width/2,ty=target.y+target.height/2;
      const contribution=weight*signals[layer][j],relative=Math.abs(contribution)/max;
      if(relative<MIN_CONTRIBUTION)return;
      const strength=Math.min(15,Math.floor(relative*15)),path=buckets[(contribution<0?16:0)+strength];
      path.moveTo(sx,sy);path.bezierCurveTo(sx+28,sy,tx-28,ty,tx,ty);
    })));
    buckets.forEach((path,n)=>{const level=n%16;ctx.strokeStyle=n<16?'#5a879b':'#b38c72';ctx.globalAlpha=.012+level/15*.16;ctx.lineWidth=.35+level/15*.4;ctx.stroke(path);});
    return image;
  },[before,signals]);
  const globalRoutes=useMemo(()=>before.layers.map((layer,l)=>{
    const routes:{d:string;value:number}[]=[];
    layer.weight.forEach((row,j)=>row.forEach((w,i)=>{
      const a=cellBox({layer:l,row:j,col:i}),x=a.x+a.width/2,y=a.y+a.height/2,b=boards[l-1];
      const tx=b?b.x+b.w:104,ty=b?b.y+(i+.5)*b.h/128:108+i*37;
      const d=`M ${x} ${y} C ${x-26} ${y-12}, ${tx+26} ${ty-12}, ${tx} ${ty}`;
      routes.push({d:l===2?`M 868 222 C 838 222, ${x+20} ${y}, ${x} ${y} `+d:d,value:signals[l][j]*w});
    }));
    const max=Math.max(1e-20,...routes.map(r=>Math.abs(r.value)));
    const visible=routes.filter(r=>Math.abs(r.value)/max>=MIN_CONTRIBUTION).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,64);
    return Array.from({length:12},(_,bucket)=>({d:visible.filter(r=>Math.abs(r.value)/max>=MIN_CONTRIBUTION&&(r.value<0?6:0)+Math.min(5,Math.floor(Math.abs(r.value)/max*5))===bucket).map(r=>r.d).join(' '),sign:bucket>=6,strength:(bucket%6)/5})).filter(g=>g.d);
  }),[before,signals]);
  const images = useMemo(() => {
    if (typeof document === 'undefined') return [];
    return [before, after].map(model => {
      const image = document.createElement('canvas'); image.width = 1880; image.height = 840;
      const ctx = image.getContext('2d')!; ctx.scale(2, 2);
      boards.forEach((b,l) => {
        const field = document.createElement('canvas'); field.width = l === 2 ? 1 : b.cols; field.height = 128;
        const c = field.getContext('2d')!;
        for (let row=0;row<128;row++) for (let col=0;col<field.width;col++) {
          const j=l===2?0:row,i=l===2?row:col;
          c.fillStyle=heat(model.layers[l].weight[j][i]-initial.layers[l].weight[j][i],limit);c.fillRect(col,row,1,1);
        }
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(field,b.x,b.y,b.w,b.h);
      });
      return image;
    });
  }, [before,after,initial,limit]);
  useEffect(() => {
    const ctx=canvas.current?.getContext('2d');if(!ctx||!images.length)return;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1880,840);ctx.drawImage(images[0],0,0);ctx.scale(2,2);
    boards.forEach((b,l)=>{
      const amount=revealFor(l,phase,part),cols=l===2?1:b.cols,total=amount*cols*128,n=Math.floor(total),column=Math.floor(n/128),row=n%128,w=b.w/cols,h=b.h/128;
      if(!amount)return;
      ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,column*w,b.h);if(column<cols)ctx.rect(b.x+column*w,b.y,w,row*h);ctx.clip();ctx.drawImage(images[1],0,0,940,420);ctx.restore();
      if(column<cols){ctx.save();ctx.globalAlpha=total-n;ctx.beginPath();ctx.rect(b.x+column*w,b.y+row*h,w,h);ctx.clip();ctx.drawImage(images[1],0,0,940,420);ctx.restore();}
    });
    if(lossSelected){ctx.save();ctx.fillStyle='#fafbfd';ctx.globalAlpha=.48;boards.forEach((b,l)=>{if(l!==activeLayer)ctx.fillRect(b.x,b.y,b.w,b.h);});ctx.restore();}
    if(connections){ctx.save();ctx.globalAlpha=(focused||lossSelected)?.05:.42;ctx.drawImage(connections,0,0,940,420);ctx.restore();}
  },[images,phase,part,connections,focused,lossSelected,activeLayer]);
  const target=cellBox(selected),deps=dependencies(selected);
  const largest=terms.reduce((best,v,i)=>Math.abs(v)>Math.abs(terms[best]??0)?i:best,0);
  const strongColor=terms[largest]>=0?'#4c819d':'#ac7c62';
  const paths=deps.map((dep,i)=>{
    const a=cellBox(dep),x=a.x+a.width/2,y=a.y+a.height/2,tx=target.x+target.width/2,ty=target.y+target.height/2;
    return { dep, box:a, d:`M ${x} ${y} C ${x-45} ${y-24}, ${tx+55} ${ty-24}, ${tx} ${ty}`, strong:i===largest };
  });
  const lossPath=`M 868 222 C 838 222, ${target.x+65} ${target.y+target.height/2}, ${target.x+target.width/2} ${target.y+target.height/2}`;
  const previous=boards[selected.layer-1],forwardX=previous?previous.x+previous.w:104,forwardY=previous?previous.y+(selected.col+.5)*previous.h/128:108+selected.col*37;
  const forwardPath=`M ${forwardX} ${forwardY} C ${forwardX+35} ${forwardY}, ${target.x-30} ${target.y+target.height/2}, ${target.x+target.width/2} ${target.y+target.height/2}`;
  const termMax=Math.max(1e-20,...terms.map(Math.abs));
  const continuation=useMemo(()=>{
    const lines:{d:string;value:number}[]=[];
    function visit(cell:Cell,incoming:number){
      if(cell.layer===0)return;
      const l=cell.layer-1,j=cell.col,b=cellBox(cell),x=b.x+b.width/2,y=b.y+b.height/2;
      const delta=incoming*before.layers[cell.layer].weight[cell.row][cell.col]*(1-activations[l][j]**2);
      before.layers[l].weight[j].forEach((_,k)=>{
        const nextCell={layer:l,row:j,col:k},a=cellBox(nextCell),tx=a.x+a.width/2,ty=a.y+a.height/2;
        const input=l===0?inputs[k]:activations[l-1][k];
        lines.push({d:`M ${x} ${y} C ${x-35} ${y-16}, ${tx+35} ${ty-16}, ${tx} ${ty}`,value:delta*input});
        visit(nextCell,delta);
      });
    }
    visit(selected,signals[selected.layer][selected.row]);
    const max=Math.max(1e-20,...lines.map(l=>Math.abs(l.value)));
    return Array.from({length:16},(_,bucket)=>({d:lines.filter(l=>Math.abs(l.value)/max>=MIN_CONTRIBUTION&&(l.value<0?8:0)+Math.min(7,Math.floor(Math.abs(l.value)/max*7))===bucket).map(l=>l.d).join(' '),negative:bucket>=8,strength:(bucket%8)/7})).filter(b=>b.d);
  },[selected,before,inputs,signals,activations]);
  function pick(event: React.PointerEvent<SVGRectElement>,layer:number) {
    const matrix=svg.current?.getScreenCTM();if(!matrix)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());onSelect(hitCell(layer,point.x,point.y));
  }
  function toggleZoom(){
    const next=!expanded;setExpanded(next);
    requestAnimationFrame(()=>{if(!scroller.current||!svg.current)return;const scale=svg.current.getBoundingClientRect().width/940;scroller.current.scrollTo({left:next?(lossSelected?893:target.x+target.width/2)*scale-scroller.current.clientWidth/2:0,behavior:'instant'});});
  }
  return <><div className={s.viewSwitch}><span>完整网络 · 每个色格对应一个权重</span><div><button onClick={onLossSelect} aria-pressed={lossSelected}>全网反馈</button><button onClick={toggleZoom} aria-pressed={expanded}>{expanded?'全网概览':'放大选格'}</button></div></div><div ref={scroller} className={s.diagramScroll} data-expanded={expanded} tabIndex={0} aria-label="完整网络图，可横向滚动">
    <svg ref={svg} viewBox="0 0 940 420" className={s.diagram} role="group" aria-label="完整 PPO 策略网络与权重更新路径">
      <g className={s.columnTitles}><text x="65" y="30">环境输入</text><text x="229" y="30">第一隐藏层</text><text x="522" y="30">第二隐藏层</text><text x="781" y="30">输出层</text></g>
      <g className={s.columnMeta}><text x="65" y="49">7 个数</text><text x="229" y="49">128 个神经元</text><text x="522" y="49">128 个神经元</text><text x="781" y="49">1 个神经元</text></g>
      <foreignObject x="0" y="0" width="940" height="420" pointerEvents="none"><canvas ref={canvas} width="1880" height="840" style={{width:940,height:420}}/></foreignObject>
      {['高度','速度','燃料','实际推力','刹车能力','燃料储备','安全速度'].map((name,i)=><g key={name} data-studio-input={i}>
        <text x="82" y={105+i*37} textAnchor="end" className={s.inputName}>{name}</text><text x="82" y={119+i*37} textAnchor="end" className={s.inputValue}>{inputs[i].toFixed(3)}</text>
        <circle cx="104" cy={108+i*37} r="4" fill="#fbfcfd" stroke="#91a7b7"/>
        <path d={`M 110 ${108+i*37} H 150`} stroke="#d9e1e6" strokeWidth=".7"/>
      </g>)}
      {boards.map((b,l)=><g key={l}>
        <rect x={b.x-.5} y={b.y-.5} width={b.w+1} height={b.h+1} fill="none" stroke={l===activeLayer?'#a2b4c4':'#dce4e9'} strokeWidth="1"/>
        <text x={b.x+b.w/2} y="375" className={s.columnMeta}>{l===0?'128 × 7 个权重':l===1?'128 × 128 个权重':'128 个权重'}</text>
        {l===activeLayer&&<line data-studio-scan x1={b.x+(part===1?1:part*3%1)*b.w} x2={b.x+(part===1?1:part*3%1)*b.w} y1={b.y} y2={b.y+b.h} stroke={phase===0?'#6594af':'#a17f9f'} strokeWidth="1" opacity=".65"/>}
      </g>)}
      <g className={s.lossNode} role="button" tabIndex={0} aria-label="查看飞行反馈与策略损失的全网传播" aria-pressed={lossSelected} onClick={onLossSelect} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onLossSelect();}}}><circle cx="893" cy="222" r="25"/><circle cx="893" cy="222" r="20"/><text x="893" y="226">损失</text><text x="893" y="181">飞行反馈</text><text x="893" y="266">点击查看全网</text></g>
      {lossSelected&&<g pointerEvents="none" data-global-propagation>{globalRoutes.map((groups,l)=><g key={l} data-global-layer={l} opacity={l===activeLayer?1:.1}>{groups.map((g,i)=><g key={i}><path d={g.d} fill="none" stroke={g.sign?'#b08b77':'#658b9f'} strokeWidth={.45+g.strength*.45} opacity={.12+g.strength*.5}/>{l===activeLayer&&<path d={g.d} fill="none" stroke={g.sign?'#ac7e66':'#507e97'} strokeWidth="1" strokeDasharray="9 55" strokeDashoffset={(phase===0?1:-1)*part*130} opacity={g.strength*.55}/>}</g>)}</g>)}</g>}
      {focused&&phase===0&&<g pointerEvents="none"><path d={forwardPath} fill="none" stroke="#66879f" strokeWidth="1.1"/><path d={forwardPath} fill="none" stroke="#3f6b8a" strokeWidth="1.8" pathLength="100" strokeDasharray="10 90" strokeDashoffset={10-part*110}/></g>}
      {focused&&phase!==0&&<g pointerEvents="none" data-studio-dependencies={selected.layer}>
        {selected.layer===0&&paths.map((p,i)=>{if(Math.abs(terms[i])/termMax<MIN_CONTRIBUTION)return null;const origin=cellBox({layer:2,row:0,col:p.dep.row}),x=origin.x+origin.width/2,y=origin.y+origin.height/2,tx=p.box.x+p.box.width/2,ty=p.box.y+p.box.height/2;return <path key={i} d={`M ${x} ${y} C ${x-30} ${y-12}, ${tx+30} ${ty-12}, ${tx} ${ty}`} fill="none" stroke={terms[i]>=0?'#658aa1':'#ad8575'} strokeWidth=".7" opacity={.015+.5*(Math.abs(terms[i])/termMax)}/>;})}
        <g data-related-branches>{continuation.map((b,i)=><g key={i}><path d={b.d} fill="none" stroke={b.negative?'#ad8575':'#658aa1'} strokeWidth={.5+b.strength*.7} opacity={.03+b.strength*.65}/><path d={b.d} fill="none" stroke={b.negative?'#ad8575':'#658aa1'} strokeWidth=".8" strokeDasharray="8 32" strokeDashoffset={-part*80} opacity={b.strength*.35}/></g>)}</g>
        {paths.length>0?<>
          {paths.map((p,i)=>Math.abs(terms[i])/termMax<MIN_CONTRIBUTION?null:<g key={i}><path d={p.d} fill="none" stroke={terms[i]>=0?'#658aa1':'#ad8575'} strokeWidth=".9" opacity={.015+.7*(Math.abs(terms[i])/termMax)}/><path d={p.d} fill="none" stroke={terms[i]>=0?'#658aa1':'#ad8575'} strokeWidth="1.1" pathLength="100" strokeDasharray="10 90" strokeDashoffset={10-part*110} opacity={.6*(Math.abs(terms[i])/termMax)}/></g>)}
          {paths.filter(p=>p.strong).map(p=><g key={p.dep.row} data-source-layer={p.dep.layer} data-source-row={p.dep.row} data-source-col={p.dep.col}>
            <rect x={p.box.x} y={p.box.y} width={p.box.width} height={p.box.height} fill="#fff" fillOpacity=".4" stroke={strongColor} strokeWidth="1"/>
          </g>)}
        </>:<><path d={lossPath} fill="none" stroke="#8b779c" strokeWidth="1"/><path d={lossPath} fill="none" stroke="#755c89" strokeWidth="1.8" pathLength="100" strokeDasharray="10 90" strokeDashoffset={10-part*110}/></>}
      </g>}
      {focused&&<g pointerEvents="none"><rect data-studio-selected x={target.x} y={target.y} width={target.width} height={target.height} fill="#fff" fillOpacity=".5" stroke="#294e6a" strokeWidth="1.3"/>
        <path d={`M ${target.x+target.width/2-5} ${target.y-5} h 10 M ${target.x+target.width/2} ${target.y-10} v 5`} stroke="#294e6a" strokeWidth="1"/>
      </g>}
      {boards.map((b,l)=><rect key={l} data-studio-layer={l} x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" style={{touchAction:'none',cursor:'crosshair'}} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pick(e,l);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))pick(e,l);}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}/>)}
      <text x="65" y="375" className={s.columnMeta}>标准化后</text>
    </svg>
  </div></>;
}
