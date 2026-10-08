'use client';
import {useEffect,useState} from 'react';
import {RESULT_LABELS,RESULT_MESSAGES,replyLabel,type RecruitmentResult,type ResultStatus} from '../../../../lib/interview/results';
import s from '../interview.module.css';

type Props={id:string;totalScore:number|null;reviewRevision:number;result:RecruitmentResult;disabled:boolean;onSaved:(result:RecruitmentResult)=>void;onRefresh:()=>void};
const date=(value:string)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
export default function RecruitmentResultPanel({id,totalScore,reviewRevision,result,disabled,onSaved,onRefresh}:Props){
 const [status,setStatus]=useState<ResultStatus>(result.status),[message,setMessage]=useState(result.message),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false);
 useEffect(()=>{setStatus(result.status);setMessage(result.message);setError('');setConflict(false);},[id,result.revision,result.status,result.message]);
 async function publish(){
  if(disabled||busy)return;setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/interview/submissions/'+id+'/result',{method:'PUT',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,message,revision:result.revision,reviewRevision})});
   const data=await response.json();
   if(!response.ok){setConflict(data.code==='RESULT_CONFLICT');throw new Error(data.error||'通知未保存，请重试。');}
   onSaved(data.result);setNotice(status==='pending'?'通知已撤回，学生仍可查看已完成的评分。':'通知已发布到该学生的查分页，等待本人回复。');
  }catch(reason){setError(reason instanceof Error?reason.message:'通知未保存，请重试。');}finally{setBusy(false);}
 }
 return <section className={s.recruitmentPanel} aria-label="发布招新结果与查看学生回复">
  <div className={s.resultHeading}><div><p className={s.eyebrow}>RESULT / CANDIDATE RESPONSE</p><h3>招新结果与学生回复</h3></div><button type="button" disabled={disabled||busy} onClick={onRefresh}>[ 刷新学生回复 ]</button></div>
  <p className={s.muted}>{totalScore===null?'整卷评分保存完成后，成绩会向本人开放；复试通知需在评分完成后单独发布。':'已完成的总分、各题得分与评语已向本人开放。请由负责人决定是否邀请复试，不按分数自动录取。'}</p>
  <dl className={s.resultSummary}><dt>当前通知</dt><dd>{RESULT_LABELS[result.status]}{result.publishedAt&&' · '+date(result.publishedAt)}</dd><dt>学生回复</dt><dd>{replyLabel(result.status,result.reply)}{result.repliedAt&&' · '+date(result.repliedAt)}</dd></dl>
  {result.status!=='pending'&&<p className={s.publicMessage}>{result.message}</p>}
  <fieldset className={s.formFields} disabled={disabled||busy}>
   <label className={s.choiceLabel}>发布结果<select value={status} onChange={event=>{const next=event.target.value as ResultStatus;setStatus(next);setMessage(RESULT_MESSAGES[next]);setNotice('');}}><option value="pending">暂不通知 / 撤回已有通知</option><option value="interview">邀请进入复试（学生可接受或放弃）</option><option value="not_selected">本轮未进入复试（询问是否愿意再次测试）</option></select></label>
   {status!=='pending'&&<label className={s.commentLabel}>通知正文（学生可见）<textarea rows={4} maxLength={2000} value={message} onChange={event=>{setMessage(event.target.value);setNotice('');}}/></label>}
   {status!==result.status&&result.reply&&<p className={s.muted}>更换结果类型会清除当前回复，学生需要按新通知重新选择；原回复保留在操作记录中。</p>}
   <div className={s.resultActions}><button type="button" disabled={disabled||busy||conflict||(status==='pending'&&result.status==='pending')||(status!=='pending'&&totalScore===null)} onClick={()=>void publish()}>[ {busy?'正在保存…':status==='pending'?'撤回通知':'发布通知给学生'} ]</button></div>
  </fieldset>
  {disabled&&<p className={s.muted}>请先保存或放弃当前评分修改，再操作结果通知。</p>}
  {error&&<p className={s.error} role="alert">{error}</p>}
  {conflict&&<button type="button" disabled={disabled||busy} onClick={onRefresh}>[ 载入最新评分与回复 ]</button>}
  {notice&&<p className={s.savedNotice} role="status">{notice}</p>}
 </section>;
}
