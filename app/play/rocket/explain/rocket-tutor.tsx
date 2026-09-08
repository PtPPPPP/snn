"use client";
import {useEffect,useRef,useState} from 'react';
import {streamChatMessage,type AiChatMessage} from '../../../../lib/ai-client';
import styles from './lesson.module.css';
export type TutorSnapshot={time:number;selection:string;context:string;timeLabel?:string};
type Turn={question:string;answer:string;label:string;context:string;complete:boolean};
export default function RocketTutor({snapshot,locked=false,onFollow,onLock,mode='inference'}:{snapshot:TutorSnapshot;mode?:'inference'|'training';locked?:boolean;onFollow?:()=>void;onLock?:()=>void}){
 const [question,setQuestion]=useState(''),[turns,setTurns]=useState<Turn[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function ask(value:string){
  if(controller.current||!value.trim())return;
  const frozen={...snapshot},q=value.trim().slice(0,1000),ac=new AbortController();controller.current=ac;
  const label=`${frozen.timeLabel??`${frozen.time.toFixed(2)} 秒`} · ${frozen.selection}`;
  const history:AiChatMessage[]=turns.filter(t=>t.complete).slice(-2).flatMap(t=>[{role:'user',content:t.context+'\n学生问题：'+t.question},{role:'assistant',content:t.answer.slice(0,5000)}]);
  const prompt=(mode==='training'?'这是训练页答疑：所附为从初始化开始的真实 PPO 训练记录回放，不是浏览器实时训练。区分整批初始梯度、单个样本贡献和多次 Adam 更新后的实际改变量；反传路径贡献不能等同于最终 Adam 改变量的因果分摊。只引用所附记录，不推断模型已学会降落。\n':'')+'你是 SNN 火箭实验的高中生数学助教。用简明中文，先直接回答，再用当前数据举例，通常不超过250字。用 a1+a2+…+an+b 解释求和，不用矩阵和复杂符号。下方是提问时冻结的模型真实数据；飞行继续播放，不要把之后的状态当作该问题的状态。区分已知计算与推测：激活值和权重不能证明神经元有特定语义，不能声称相关性就是因果。未提供的训练成绩不能编造。你只解释，不能控制火箭。缺少证据时说明缺少什么。\n';
  setTurns(v=>[...v.slice(-5),{question:q,answer:'',label,context:frozen.context,complete:false}]);setQuestion('');setBusy(true);setError('');
  const timer=setTimeout(()=>ac.abort(),90000);
  try{await streamChatMessage({messages:[{role:'user',content:prompt},...history,{role:'user',content:frozen.context+'\n学生问题：'+q}],signal:ac.signal,onDelta:text=>setTurns(v=>v.map((t,i)=>i===v.length-1?{...t,answer:t.answer+text}:t)),onReasoningStart:()=>{},onDone:()=>setTurns(v=>v.map((t,i)=>i===v.length-1?{...t,complete:true}:t)),onError:()=>{throw new Error('stream');}});}
  catch{setError(ac.signal.aborted?'回答已停止或超时，可以重新提问。':'SNN AI 暂时无法连接，请稍后重试。当前没有取得完整回答。');}
  finally{clearTimeout(timer);controller.current=null;setBusy(false);}
 }
 return <section className={styles.tutor} aria-label="实验 AI 答疑"><h2>问问 SNN AI</h2><div className={styles.questionContext}><b>{locked?'已记录':mode==='training'?'跟随当前训练':'跟随当前飞行'} · {snapshot.timeLabel??`${snapshot.time.toFixed(2)} 秒`} · {snapshot.selection}</b>{locked?<button onClick={onFollow}>跟随当前</button>:<button onClick={onLock}>锁定这一刻</button>}</div>
 <form onSubmit={e=>{e.preventDefault();void ask(question);}}><label htmlFor="rocket-question">你的问题</label><textarea id="rocket-question" rows={2} maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder={mode==='training'?'例如：这条反馈为什么会让权重变小？':'例如：为什么速度是负数，油门却在变大？'}/><div><small>将附上 {snapshot.timeLabel??`${snapshot.time.toFixed(2)} 秒`} · {snapshot.selection}</small>{busy?<button type="button" onClick={()=>controller.current?.abort()}>停止回答</button>:<button disabled={!question.trim()} type="submit">发送问题</button>}</div></form>
 <div className={styles.tutorQuestions}>{(mode==='training'?['解释这次权重更新','这些反馈线是什么意思？']:['解释当前结果','这个正负数是什么意思？']).map(q=><button key={q} disabled={busy} onClick={()=>void ask(q)}>{q}</button>)}</div>
 <div className={styles.tutorMessages}>{turns.map((t,i)=><article key={i}><small>{t.label}</small><h3>{t.question}</h3><div>{t.answer||(busy&&i===turns.length-1?'正在连接 AI…':'未收到回答')}</div>{!t.complete&&t.answer&&!busy&&<small>回答未完成</small>}</article>)}</div>
 {error&&<p role="alert">{error}</p>}

 </section>;
}
