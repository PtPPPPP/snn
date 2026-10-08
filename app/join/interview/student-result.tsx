'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {RESULT_LABELS,durationLabel,replyLabel,type CandidateReply,type RecruitmentResult,type StudentResult} from '../../../lib/interview/results';
import s from './interview.module.css';

const date=(value:string)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch(path,{cache:'no-store',credentials:'same-origin',...init}),data=await response.json();
 if(!response.ok)throw new Error(data.error||'暂时无法读取成绩，请稍后再试。');return data;
}
export default function StudentResultPanel(){
 const [data,setData]=useState<StudentResult|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  void api<StudentResult>('/api/interview/result',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'读取失败，请重试。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[]);
 async function refresh(){
  setLoading(true);setError('');setNotice('');
  try{setData(await api<StudentResult>('/api/interview/result'));}catch(reason){setError(reason instanceof Error?reason.message:'读取失败，请重试。');setData(null);}finally{setLoading(false);}
 }
 async function reply(choice:CandidateReply){
  if(!data||busy||loading)return;setBusy(true);setError('');setNotice('');
  try{
   const saved=await api<{result:RecruitmentResult}>('/api/interview/result/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reply:choice,revision:data.result.revision})});
   setData({...data,result:saved.result});setNotice('你的回复已保存，招新负责人可以看到。');
  }catch(reason){setError(reason instanceof Error?reason.message:'回复未保存，请重试。');}finally{setBusy(false);}
 }
 return <section className={s.receipt} aria-label="我的笔试成绩与招新结果">
  <div className={s.resultHeading}><div><p className={s.eyebrow}>SNN / MY RESULT</p><h2>[ 我的成绩与结果 ]</h2></div><button type="button" disabled={loading||busy} onClick={()=>void refresh()}>[ {loading?'正在读取…':'刷新成绩与通知'} ]</button></div>
  {error&&<p className={s.error} role="alert">{error}</p>}
  {!data&&!loading&&<p className={s.muted}>请使用登记笔试的原浏览器。更换设备或清除浏览器数据后，请联系招新负责人核验身份并解除原设备绑定，再返回填写原姓名和学号。</p>}
  {data&&<>
   <p>{data.profile.name} · {data.profile.studentId}</p>
   <div className={s.resultScore}><div><span>笔试成绩</span><strong>{data.score?<>{data.score.total}<small> / {data.score.max}</small></>:'待评分'}</strong></div><div><span>作答用时</span><strong className={s.durationValue}>{durationLabel(data.receipt.elapsedSeconds)}</strong></div></div>
   {!data.score&&<p className={s.muted}>答卷已经保存。负责人完成并保存整卷评分后，总分、各题得分和评语会自动在这里开放。</p>}
   {data.score&&<>
    <details className={s.scoreDetails} open><summary>[ 各题得分与评语 ]</summary><ol>{data.score.questions.map((question,index)=><li key={question.id}><div><span>Q{String(index+1).padStart(2,'0')} · {question.title}</span><strong>{question.score} / {question.maxScore}</strong></div>{question.comment&&<p>{question.comment}</p>}</li>)}</ol></details>
    {data.score.feedback&&<div className={s.resultFeedback}><h3>负责人总评</h3><p>{data.score.feedback}</p></div>}
   </>}
   <section className={s.resultNotice} aria-label="招新结果通知"><p className={s.eyebrow}>NEXT STEP</p><h3>[ {RESULT_LABELS[data.result.status]} ]</h3><p>{data.result.message}</p>
    {data.result.publishedAt&&<p className={s.muted}>发布于 {date(data.result.publishedAt)}</p>}
    {data.result.status!=='pending'&&data.result.publishedAt&&<>
     <div className={s.resultActions}><button type="button" disabled={busy||loading||data.result.reply==='accept'} aria-pressed={data.result.reply==='accept'} onClick={()=>void reply('accept')}>[ {data.result.status==='interview'?'我愿意参加复试':'愿意参加下一次测试'} ]</button><button type="button" disabled={busy||loading||data.result.reply==='decline'} aria-pressed={data.result.reply==='decline'} onClick={()=>void reply('decline')}>[ {data.result.status==='interview'?'放弃本次复试':'暂不参加下一次测试'} ]</button></div>
     <p aria-live="polite">你的回复：{replyLabel(data.result.status,data.result.reply)}{data.result.repliedAt&&' · '+date(data.result.repliedAt)}</p><p className={s.muted}>可以修改回复，负责人会看到你的最新选择。愿意参加下一次测试仅表示意愿，具体场次另行安排。</p>
    </>}
   </section>
   <dl>{data.receipt.startedAt&&<><dt>开始时间</dt><dd>{date(data.receipt.startedAt)}</dd></>}<dt>提交时间</dt><dd>{date(data.receipt.submittedAt)}</dd><dt>答卷编号</dt><dd>{data.receipt.id}</dd></dl>
  </>}
  {notice&&<p className={s.savedNotice} role="status">{notice}</p>}
  <Link href="/join/interview" className={s.primaryLink}>[ 返回入社笔试 ]</Link>
 </section>;
}
