"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {applyGradient,binaryLoss,correctMistake,equivalentLinear,examples,forward,gradients,hasMeaningfulBoundary,metrics,parameterName,trainStep,type Network} from '../../../lib/learning/foundations';
import {initialExperiment,type ExperimentId,type InlineSnapshot} from '../../../lib/learning/inline-experiments';
import {ActivationPlot,ContributionInspector,DecisionField,LossPlot,NetworkDiagram,number,signed} from './components';
import s from './reading.module.css';
import FeedbackMessage, {PredictionLegend} from './local-feedback';
type GradientSnapshot={model:Network;gradient:number[];rate:number};
type State={snapshot:InlineSnapshot;playing:boolean;pending:GradientSnapshot|null;last:GradientSnapshot|null;status:string};
const fresh=(id:ExperimentId):State=>({snapshot:initialExperiment(id),playing:false,pending:null,last:null,status:'本段独立实验，使用固定初始参数。'});

export default function InlineExperiment({id,title,instruction}:{id:ExperimentId;title:string;instruction:string}) {
 const [state,setState]=useState(()=>fresh(id));const [attempt,setAttempt]=useState(0);const root=useRef<HTMLElement>(null),inView=useRef(true);
 const q=state.snapshot,{model,dataset,steps,picked,rate}=q,perceptron=model.kind==='perceptron';
 const data=useMemo(()=>examples(dataset),[dataset]),point=data[picked],trace=forward(model,point.x),score=metrics(model,data);
 const selection={layer:q.selected===4?'output' as const:'hidden' as const,index:q.selected===4?0:q.selected};
 const indices=perceptron?[0,1,2]:q.selected===4?[12,13,14,15,16]:[q.selected*2,q.selected*2+1,8+q.selected];
 const parameter=id==='backprop'?q.parameter:indices.includes(q.parameter)?q.parameter:indices[0];
 const value=model.parameters[parameter],range=Math.max(3,Math.ceil(Math.abs(value))),snapshot=state.pending??state.last;
 const canTrain=id==='perceptron'||id==='backprop',complete=steps>=(perceptron?200:1200)||(perceptron&&score.mistakes===0);
 const sum=q.selected===4?trace.logit:trace.sums[q.selected],output=q.selected===4?trace.probability:trace.hidden[q.selected];
 useEffect(()=>{
  const node=root.current;if(!node)return;
  const observer=new IntersectionObserver(([entry])=>{inView.current=entry.intersectionRatio>=.25;if(!inView.current)setState(current=>current.playing?{...current,playing:false,status:'实验离开主要视野，自动训练已暂停。'}:current);},{threshold:[0,.25]});
  observer.observe(node);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!state.playing)return;
  const timer=window.setInterval(()=>{
   if(document.hidden)return;
   setState(current=>{
    if(!current.playing)return current;
    if(!inView.current)return {...current,playing:false,status:'实验离开主要视野，自动训练已暂停。'};
    const now=current.snapshot,points=examples(now.dataset),max=now.model.kind==='perceptron'?200:1200;
    if(now.steps>=max)return {...current,playing:false,status:'已到本段实验的更新上限。'};
    if(now.model.kind==='perceptron') {
     const next=correctMistake(now.model,points,now.rate);if(!next.point)return {...current,playing:false,status:'这组 36 个样本已全部分对。'};
     const step=now.steps+1,m=metrics(next.model,points);
     return {...current,snapshot:{...now,model:next.model,picked:next.point.id,steps:step,history:[...now.history,{step,loss:m.loss}]},playing:step<max&&m.mistakes>0,status:`已修正 ${step} 次，剩余 ${m.mistakes} 个错分点。`};
    }
    const next=trainStep(now.model,points,now.rate),m=metrics(next.model,points),step=now.steps+1;
    if(!Number.isFinite(m.loss))return {...current,playing:false,status:'数值超出范围，已停止。请重置或减小学习率。'};
    return {...current,snapshot:{...now,model:next.model,steps:step,history:[...now.history,{step,loss:m.loss}]},last:{model:now.model,gradient:next.gradient,rate:now.rate},pending:null,playing:step<max,status:step===max?'已到 1,200 次更新上限。':'正在使用全部 36 个样本训练。'};
   });
  },80);return()=>window.clearInterval(timer);
 },[state.playing]);
 function reset(){setAttempt(current=>current+1);setState({...fresh(id),status:'只重置了本段实验，其余段落保持不变。'});}
 function pick(pointId:number){setState(current=>({...current,playing:false,status:current.playing?'已按所选样本暂停本段训练。':current.status,snapshot:{...current.snapshot,picked:pointId}}));}
 function selectNeuron(selected:number){setState(current=>({...current,playing:false,status:current.playing?'已暂停训练，查看所选单元。':current.status,snapshot:{...current.snapshot,selected,parameter:selected===4?12:selected*2}}));}
 function revise(next:Network){setState(current=>({...current,snapshot:{...current.snapshot,model:next,steps:0,history:[{step:0,loss:metrics(next,data).loss}]},playing:false,pending:null,last:null,status:'本段参数已修改，图和读数已同步更新。'}));}
 function changeParameter(next:number){if(Number.isFinite(next))revise({...model,parameters:model.parameters.map((w,i)=>i===parameter?Math.max(-20,Math.min(20,next)):w)});}
 function step(){
  if(complete)return;
  if(perceptron){const next=correctMistake(model,data,rate);if(!next.point)return;const n=steps+1,m=metrics(next.model,data);setState(current=>({...current,snapshot:{...q,model:next.model,picked:next.point!.id,steps:n,history:[...q.history,{step:n,loss:m.loss}]},playing:false,status:`使用样本 ${next.point!.id+1} 修正一次，剩余 ${m.mistakes} 个错分点。`}));}
  else if(!state.pending)setState(current=>({...current,playing:false,pending:{model,gradient:gradients(model,data),rate},last:null,status:'梯度已算好，参数和图还没有改变。'}));
  else {const before=state.pending,next=applyGradient(before.model,before.gradient,before.rate),m=metrics(next,data),n=steps+1;if(!Number.isFinite(m.loss))return;setState(current=>({...current,snapshot:{...q,model:next,steps:n,history:[...q.history,{step:n,loss:m.loss}]},playing:false,last:before,pending:null,status:`已同时更新 17 个参数。平均损失 ${score.loss.toFixed(4)} → ${m.loss.toFixed(4)}。`}));}
 }
 const controls=<>
  {['neuron','xor-limit','layers'].includes(id)&&<>{id==='layers'&&<label className={s.controlRow}>本段单元<select aria-label="查看单元" value={q.selected} onChange={e=>selectNeuron(Number(e.target.value))}>{[0,1,2,3].map(i=><option key={i} value={i}>隐藏单元 h{i+1}</option>)}<option value="4">输出 p</option></select></label>}<div className={s.parameterControl}><select aria-label="调整参数" value={parameter} onChange={e=>setState(current=>({...current,snapshot:{...q,parameter:Number(e.target.value)}}))}>{indices.map(i=><option key={i} value={i}>{parameterName(model,i)}</option>)}</select><input type="range" aria-label="参数滑块" min={-range} max={range} step=".01" value={value} onChange={e=>changeParameter(Number(e.target.value))}/><input type="number" aria-label="参数数值" min="-20" max="20" step=".01" value={Number(value.toFixed(3))} onChange={e=>changeParameter(e.target.valueAsNumber)}/></div></>}
  {id==='activation'&&<div className={s.segmented} role="group" aria-label="本段隐藏层激活"><button aria-pressed={model.activation==='linear'} onClick={()=>revise({...model,activation:'linear'})}>直接传递</button><button aria-pressed={model.activation==='tanh'} onClick={()=>revise({...model,activation:'tanh'})}>tanh 非线性</button></div>}
  {canTrain&&<><div className={s.actions}><button className={s.primary} disabled={complete||state.playing} onClick={step}>{perceptron?'修正一个错分点':state.pending?'应用参数更新':'计算梯度'}</button><button disabled={complete} onClick={()=>setState(current=>({...current,playing:!current.playing,pending:null,status:current.playing?'本段训练已暂停。':'本段自动训练中。'}))}>{state.playing?'暂停':perceptron?'自动修正':'自动训练'}</button></div>{id==='backprop'&&<label className={s.controlRow}>跟踪参数<select aria-label="跟踪参数" value={parameter} onChange={e=>{const i=Number(e.target.value);setState(current=>({...current,snapshot:{...q,parameter:i,selected:i<8?Math.floor(i/2):i<12?i-8:4}}));}}>{model.parameters.map((_,i)=><option key={i} value={i}>{parameterName(model,i)}</option>)}</select></label>}</>}
  {id==='loss'&&<label className={s.controlRow}>观察样本<select aria-label="观察样本" value={picked} onChange={e=>pick(Number(e.target.value))}>{data.map(p=><option key={p.id} value={p.id}>样本 {p.id+1} · 真实类别 {p.target}</option>)}</select></label>}
 </>;
 const visual=id==='layers'?<NetworkDiagram model={model} trace={trace} selection={selection} onSelect={v=>selectNeuron(v.layer==='output'?4:v.index)} backward={false}/>:<DecisionField model={model} data={data} selected={picked} onSelect={pick}/>;
 const linear=id==='layers'?equivalentLinear(model):null;
 const feedback={attempt,model:JSON.stringify(model),sample:String(picked),prediction:trace.prediction,goal:score.mistakes===0};
 const feedbackSummary=`所选点：真实 ${point.target} · 预测 ${trace.prediction} · ${trace.prediction===point.target?'分对':'分错'}。当前 ${36-score.mistakes}/36 分对。`;
 return <section ref={root} className={s.inlineExperiment} data-inline-experiment={id} aria-label={title}>
  <header><span>{title}</span><button onClick={reset}>重置本段</button></header><p className={s.instruction}>{instruction}</p>
  <div className={s.localBlock}>
   <div className={s.localControls} data-local-controls>{controls}<div className={s.localResult} data-local-result>
    {id==='backprop'?<><strong>{state.pending?'梯度已就绪，等待应用':`已更新 ${steps} 次 · 平均损失 ${score.loss.toFixed(4)}`}</strong><div className={s.updateValues}><span>{parameterName(model,parameter)} 旧值 <b>{number(snapshot?.model.parameters[parameter]??value)}</b></span><span>平均梯度 <b>{snapshot?signed(snapshot.gradient[parameter]):'待计算'}</b></span><span>{state.pending?'新值（待应用）':'当前值'} <b>{state.pending?number(state.pending.model.parameters[parameter]-state.pending.rate*state.pending.gradient[parameter]):number(value)}</b></span></div>{snapshot&&<span>{snapshot.gradient[parameter]>0?'梯度为正，本次减小这个参数。':snapshot.gradient[parameter]<0?'梯度为负，本次增大这个参数。':'该参数的平均梯度为零。'}</span>}{state.last&&<span>平均损失：{metrics(state.last.model,data).loss.toFixed(4)} → {score.loss.toFixed(4)}</span>}</>:id==='loss'?<><strong>真实类别 {point.target} · 预测类别 {trace.prediction}</strong><span>{trace.prediction===point.target?'当前分对':'当前分错'} · p = {trace.probability.toFixed(3)} · 单点损失 {binaryLoss(trace.logit,point.target).toFixed(4)}</span></>:id==='layers'?<><strong>{q.selected===4?'p':`h${q.selected+1}`} = {number(output)}</strong><span>本单元加权和 z = {number(sum)}</span></>:id==='activation'?<><strong>h1：{number(trace.sums[0])} → {number(trace.hidden[0])}</strong><span>{model.activation==='tanh'?'使用 tanh 非线性':'直接传递加权和'} · 相同初始权重作比较</span></>:<><strong>z = {number(trace.logit)} · 预测类别 {trace.prediction}</strong><span>所选输入 ({point.x.map(v=>number(v,2)).join(', ')}) · 真实类别 {point.target} · {score.mistakes} / 36 个点分错{canTrain?` · 更新 ${steps} 次`:''}</span></>}
   </div></div>
   <figure className={s.localVisual} data-local-visual>{visual}<figcaption>{id!=='layers'&&<><FeedbackMessage observation={feedback} summary={feedbackSummary} goalText="这组 36 个样本已经全部分对。36 / 36" target={point.target}/><PredictionLegend hard={perceptron}/></>}{id==='layers'?'12 条权重连接、5 个偏置。蓝 + / 棕 −；线宽表示 |权重|。':<><span>点：■ 真实 0 · ● 真实 1；× 当前分错。</span><span>{!hasMeaningfulBoundary(model)&&'模型接近常数输出，无清晰边界。'}</span></>}</figcaption></figure>
  </div>
  {id==='layers'&&linear&&<><p className={s.instruction}>把这个网络应用到许多输入，就是下面的分类图。这里重复同一组局部控件，让边界与操作放在一起：网络有两层计算，分界仍然是直线。</p><div className={s.localBlock} data-affine-boundary><div className={s.localControls}>{controls}<div className={s.localResult}><strong>z = {number(linear[0])} x₁ + ({number(linear[1])}) x₂ + ({number(linear[2])})</strong><span>上面节点图与这里的边界使用同一个网络快照。</span></div></div><figure className={s.localVisual}><DecisionField model={model} data={data} selected={picked} onSelect={pick}/><figcaption><FeedbackMessage observation={feedback} summary={feedbackSummary} goalText="这组 36 个样本已经全部分对。36 / 36" target={point.target}/><PredictionLegend hard={false}/>点的真实类别：■ 类别 0，● 类别 1。<br/>{hasMeaningfulBoundary(model)?'合并后的 z = 0 仍是一条直线。':'当前模型接近常数输出，没有清晰分界。'}</figcaption></figure></div></>}
  {canTrain&&<p className={s.status} role="status" aria-live={state.playing?'off':'polite'}>{state.status}{state.last&&' 梯度在更新前的参数处计算。'}</p>}
  {canTrain&&<div className={s.localTraining}><label>学习率<select aria-label="学习率" value={rate} onChange={e=>setState(current=>({...current,snapshot:{...q,rate:Number(e.target.value)},playing:false,pending:null,status:'下一步使用新的学习率。'}))}>{[.05,.1,.2,.5].map(v=><option key={v} value={v}>{v}</option>)}</select></label><div><span>{perceptron?'错分比例':'平均交叉熵'} {score.loss.toFixed(4)}</span><LossPlot history={q.history} perceptron={perceptron}/></div></div>}
  {linear&&<p className={s.formula}>合并两层：z = {number(linear[0])} x₁ + ({number(linear[1])}) x₂ + ({number(linear[2])})</p>}
  <details className={s.calculation} data-local-readonly><summary>本段的计算说明（只读）</summary><p>每段实验有自己的状态。这一段的操作不会改变文章其他位置的图。</p>{id==='activation'?<ActivationPlot value={trace.sums[0]} activation={model.activation}/>:<ContributionInspector model={model} trace={trace} selection={selection} readOnly gradientParameter={parameter} onChange={()=>{}} gradient={snapshot?.gradient??null} sampleGradient={snapshot?gradients(snapshot.model,[point]):null} pending={!!state.pending} previous={state.last?.model.parameters??null} rate={snapshot?.rate??rate} showGradient={id==='backprop'}/>}</details>
 </section>;
}
