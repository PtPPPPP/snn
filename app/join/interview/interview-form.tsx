'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {CASES,COMMON_IDS,OBJECTIVE_IDS,OBJECTIVE_SECTIONS,PAPER_QUESTION_COUNT,QUESTION_BANK_VERSION,QUESTIONS,QUESTION_TYPE_LABELS,TRACKS,isObjectiveQuestion,type InterviewQuestion} from '../../../lib/interview/questions';
import type {InterviewAnswer} from '../../../lib/interview/assessment';
import type {InterviewProfile,InterviewReceipt,InterviewSession} from '../../../lib/interview/session';
import QuestionBrief from './question-brief';
import AnswerTimer from './answer-timer';
import StudentResultPanel from './student-result';
import s from './interview.module.css';

async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch(path,{cache:'no-store',credentials:'same-origin',...init}),data=await response.json();
 if(!response.ok)throw new Error(data.error||'暂时无法连接笔试服务。');
 return data;
}
export default function InterviewForm(){
 const [profile,setProfile]=useState<InterviewProfile>({name:'',studentId:'',department:'',year:''});
 const [session,setSession]=useState<InterviewSession|null>(null),[loading,setLoading]=useState(true),[blocked,setBlocked]=useState(false),[confirmed,setConfirmed]=useState(false);
 const [track,setTrack]=useState(''),[scenario,setScenario]=useState(''),[answers,setAnswers]=useState<Record<string,InterviewAnswer>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<InterviewReceipt|null>(null);
 const [timing,setTiming]=useState<{startedAt:string;serverTime:string}|null>(null),[timingError,setTimingError]=useState(''),[timingAttempt,setTimingAttempt]=useState(0);
 const objective=OBJECTIVE_IDS.map(id=>QUESTIONS.find(q=>q.id===id)!),common=COMMON_IDS.map(id=>QUESTIONS.find(q=>q.id===id)!),direction=QUESTIONS.find(q=>q.id===track),caseQuestion=QUESTIONS.find(q=>q.id===scenario),chosen=[...objective,...common,...direction?[direction]:[],...caseQuestion?[caseQuestion]:[]];
 function hasAnswer(question:InterviewQuestion){
  const value=answers[question.id];
  if(isObjectiveQuestion(question))return question.kind==='multiple'?Array.isArray(value)&&value.length>0:typeof value==='string'&&value.length>0;
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&!!question.parts?.every(part=>value[part.id]?.trim());
 }
 const answered=chosen.filter(hasAnswer).length;
 const loadSession=useCallback(async()=>{
  try{
   const data=await api<InterviewSession>('/api/interview/session');
   setSession(data);setReceipt(data.receipt);setBlocked(false);
   if(data.identity)setProfile({name:data.identity.name,studentId:data.identity.studentId,department:data.identity.department,year:data.identity.year});
  }catch(error){setError(error instanceof Error?error.message:'无法读取身份状态。');setBlocked(true);}
  finally{setLoading(false);}
 },[]);
 const identityId=session?.identity?.id,receiptId=receipt?.id;
 useEffect(()=>{
  if(!identityId||receiptId)return;
  const controller=new AbortController();setTimingError('');
  void api<{startedAt:string;serverTime:string}>('/api/interview/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setTiming(data);}).catch(reason=>{if(!controller.signal.aborted)setTimingError(reason instanceof Error?reason.message:'无法开始计时，请重试。');});
  return ()=>controller.abort();
 },[identityId,receiptId,timingAttempt]);
 useEffect(()=>{
  const controller=new AbortController();
  void api<InterviewSession>('/api/interview/session',{signal:controller.signal}).then(data=>{
   if(controller.signal.aborted)return;
   setSession(data);setReceipt(data.receipt);
   if(data.identity)setProfile({name:data.identity.name,studentId:data.identity.studentId,department:data.identity.department,year:data.identity.year});
  }).catch(error=>{if(controller.signal.aborted)return;setError(error instanceof Error?error.message:'无法读取身份状态。');setBlocked(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[]);
 async function bind(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!confirmed)return;
  setBusy(true);setError('');
  try{
   const data=await api<InterviewSession>('/api/interview/identity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile)});
   setSession(data);setReceipt(data.receipt);
   if(data.identity)setProfile({name:data.identity.name,studentId:data.identity.studentId,department:data.identity.department,year:data.identity.year});
  }catch(error){setError(error instanceof Error?error.message:'无法绑定身份，请重试。');}
  finally{setBusy(false);}
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!session?.identity||!timing)return;
  const incomplete=chosen.findIndex(question=>!hasAnswer(question));
  if(chosen.length!==PAPER_QUESTION_COUNT||incomplete!==-1){setError(incomplete!==-1?'请完成第 '+(incomplete+1)+' 题的所有必答内容。':'请选择方向题和情景题。');return;}
  setError('');setBusy(true);
  try{
   const data=await api<{receipt:InterviewReceipt}>('/api/interview/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identityId:session.identity.id,questionBankVersion:QUESTION_BANK_VERSION,track,scenario,answers:Object.fromEntries(chosen.map(q=>[q.id,answers[q.id]]))})});
   setReceipt(data.receipt);
  }catch(error){setError(error instanceof Error?error.message:'提交失败，请稍后重试。');}
  finally{setBusy(false);}
 }
 function answerQuestion(question:InterviewQuestion,number:number){
  const answer=answers[question.id],values=answer&&typeof answer==='object'&&!Array.isArray(answer)?answer:{},multiple=question.kind==='multiple';
  return <article className={s.answerQuestion} key={question.id}>
  <h3 id={'question-'+question.id} className={s.questionHeading}><span className={s.number}>Q{String(number).padStart(2,'0')}</span><span>{question.title}<small className={s.points}> / {question.maxScore} 分</small></span></h3>
  {question.kind&&<p className={s.questionKind}>{QUESTION_TYPE_LABELS[question.kind]}</p>}
  <QuestionBrief question={question}/>
  {isObjectiveQuestion(question)&&<fieldset className={s.answerOptions} aria-labelledby={'question-'+question.id}>
   {question.options?.map(option=><label className={s.answerOption} key={option.id}>
    <input type={multiple?'checkbox':'radio'} name={'answer-'+question.id} value={option.id} required={!multiple} checked={multiple?Array.isArray(answer)&&answer.includes(option.id):answer===option.id} onChange={event=>{
     const checked=event.target.checked;
     setAnswers(current=>{
      if(!multiple)return {...current,[question.id]:option.id};
      const selected=current[question.id],list=Array.isArray(selected)?selected:[];
      return {...current,[question.id]:checked?[...list.filter(id=>id!==option.id),option.id]:list.filter(id=>id!==option.id)};
     });
    }}/><span>{question.kind!=='judgment'&&<strong>{option.id}.</strong>} {option.text}</span>
   </label>)}
  </fieldset>}
  {question.parts?.map((part,index)=><div className={s.answerPart} key={part.id}>
   <label htmlFor={'answer-'+question.id+'-'+part.id}><span className={s.partHeading}><span className={s.partNumber}>{index+1}</span>{part.label}</span><span className={s.partPrompt}>{part.prompt}</span></label>
   <textarea id={'answer-'+question.id+'-'+part.id} required maxLength={part.maxLength} value={values[part.id]??''} onChange={event=>{const value=event.target.value;setAnswers(current=>{const prior=current[question.id],parts=prior&&typeof prior==='object'&&!Array.isArray(prior)?prior:{};return {...current,[question.id]:{...parts,[part.id]:value}};});}} placeholder="按这一步的要求简短回答…" rows={3}/>
   <span className={s.characterCount}>{(values[part.id]??'').length} / {part.maxLength}</span>
  </div>)}
 </article>;}
 if(loading)return <section className={s.accessGate} role="status"><h2>正在读取笔试状态…</h2><p>正在检查当前浏览器的笔试身份。</p></section>;
 if(blocked)return <section className={s.accessGate}><h2>暂时无法进入笔试</h2><p className={s.error} role="alert">{error}</p><button type="button" onClick={()=>{setLoading(true);setError('');void loadSession();}}>[ 重新验证 ]</button></section>;
 if(receipt)return <StudentResultPanel/>;
 if(!session?.identity)return <form onSubmit={bind} className={s.bindingForm}><fieldset className={s.formFields} disabled={busy}><div className={s.sectionHeading}><div><p className={s.eyebrow}>01 / YOUR INFORMATION</p><h2>填写个人信息</h2></div><p>无需注册账号</p></div><p className={s.bindingNotice}>填写本人信息后即可开始笔试。本轮笔试身份将与当前浏览器绑定，请在同一浏览器完成作答。</p><div className={s.profileGrid}>
 <label>姓名<input required maxLength={40} autoComplete="name" value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
 <label>学号<input required minLength={2} maxLength={32} autoComplete="off" value={profile.studentId} onChange={e=>setProfile({...profile,studentId:e.target.value})}/></label>
 <label>学院 / 专业（选填）<input maxLength={80} value={profile.department} onChange={e=>setProfile({...profile,department:e.target.value})}/></label>
 <label>年级（选填）<select value={profile.year} onChange={e=>setProfile({...profile,year:e.target.value})}><option value="">请选择年级</option>{['大一','大二','大三','大四'].map(year=><option key={year} value={year}>{year}</option>)}</select></label>
 </div><label className={s.confirmIdentity}><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>以上是我本人的信息，我将在当前浏览器完成本轮笔试。</span></label></fieldset>{error&&<p className={s.error} role="alert">{error}</p>}<button type="submit" disabled={busy||!confirmed}>[ {busy?'正在登记身份…':'确认信息，开始作答'} ]</button><p className={s.muted}>每个学号限提交一份答卷。需要更正信息或更换浏览器时，请联系招新负责人。</p></form>;
 if(!timing)return <section className={s.accessGate}><h2>{timingError?'暂时无法开始计时':'正在开始笔试…'}</h2>{timingError?<><p className={s.error} role="alert">{timingError}</p><button type="button" onClick={()=>setTimingAttempt(value=>value+1)}>[ 重试计时 ]</button><button type="button" onClick={()=>void loadSession()}>[ 刷新笔试状态 ]</button></>:<p>开始时间将由服务器记录。</p>}</section>;
 return <form onSubmit={submit}>
 <AnswerTimer startedAt={timing.startedAt} serverTime={timing.serverTime}/>
 <section className={s.identitySummary}><div><p className={s.eyebrow}>IDENTITY BOUND</p><strong>{profile.name} · {profile.studentId}</strong><p>{[profile.department,profile.year].filter(Boolean).join(' / ')||'本轮笔试身份已绑定'}</p></div><span className={s.boundLabel}>身份已锁定</span></section>
 <p className={s.answerInstructions}>先完成 8 道基础客观题，再写 2 道简答，并各选 1 道方向题和情景题。案例均为虚构；主观题只按给定材料回答，无需运行代码或实际使用 AI 工具。</p>
 <fieldset className={s.formFields} disabled={busy}>
 <section className={s.section}><div className={s.sectionHeading}><div><p className={s.eyebrow}>FOUNDATIONS</p><h2>基础知识</h2></div><p>8 题 · 40 分 · 后台自动计分</p></div>{OBJECTIVE_SECTIONS.map(group=><div className={s.objectiveSection} key={group.label}><h3>{group.label}</h3><p className={s.muted}>{group.hint}</p>{group.ids.map(id=>answerQuestion(QUESTIONS.find(q=>q.id===id)!,OBJECTIVE_IDS.indexOf(id)+1))}</div>)}</section>
 <section className={s.section}><div className={s.sectionHeading}><div><p className={s.eyebrow}>SHORT ANSWERS</p><h2>简答题</h2></div><p>2 题 · 每题 10 分 · 每题两步</p></div>{common.map((q,i)=>answerQuestion(q,OBJECTIVE_IDS.length+i+1))}</section>
 <section className={s.section}><div className={s.sectionHeading}><div><p className={s.eyebrow}>YOUR INTEREST</p><h2>方向选答</h2></div><p>4 选 1 · 20 分</p></div><label className={s.choiceLabel}>选择感兴趣的方向<select required value={track} onChange={e=>setTrack(e.target.value)}><option value="">请选择一个方向</option>{TRACKS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{direction&&answerQuestion(direction,PAPER_QUESTION_COUNT-1)}</section>
 <section className={s.section}><div className={s.sectionHeading}><div><p className={s.eyebrow}>A SMALL SCENARIO</p><h2>情景选答</h2></div><p>4 选 1 · 20 分</p></div><label className={s.choiceLabel}>选择一个情景<select required value={scenario} onChange={e=>setScenario(e.target.value)}><option value="">请选择一个情景</option>{CASES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{caseQuestion&&answerQuestion(caseQuestion,PAPER_QUESTION_COUNT)}</section>
 </fieldset><div className={s.submitArea}><span>已回答 {answered} / {PAPER_QUESTION_COUNT} 题</span><progress max={PAPER_QUESTION_COUNT} value={answered} aria-label="答题进度"/><p>答卷将以 {profile.name} · {profile.studentId} 的身份提交。点击提交后，以提交成功提示为准。</p>{error&&<p className={s.error} role="alert">{error}</p>}<button disabled={busy} type="submit">[ {busy?'正在保存答卷…':'提交答卷'} ]</button></div></form>;
}
