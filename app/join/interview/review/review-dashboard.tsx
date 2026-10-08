'use client';
import {useCallback,useEffect,useState} from 'react';
import {isObjectiveQuestion,type InterviewQuestion} from '../../../../lib/interview/questions';
import {criterionTotal,type InterviewAnswer,type InterviewGrade as Grade,type InterviewRubric} from '../../../../lib/interview/assessment';
import IdentityManagement from './identity-management';
import QuestionBrief from '../question-brief';
import RecruitmentResultPanel from './recruitment-result-panel';
import {RESULT_LABELS,durationLabel,replyLabel,type ResultStatus,type CandidateReply,type RecruitmentResult} from '../../../../lib/interview/results';
import s from '../interview.module.css';
type Candidate={id:string;name:string;studentId:string;department:string;year:string;track:string;submittedAt:string;totalScore:number|null;reviewedAt:string|null;startedAt:string|null;elapsedSeconds:number|null;resultStatus:ResultStatus;candidateReply:CandidateReply|null;candidateRepliedAt:string|null};
type AnswerSheet=Candidate&{questionBankVersion:string;questions:InterviewQuestion[];answers:Record<string,InterviewAnswer>;grades:Record<string,Grade>;feedback:string;reviewedBy:string;reviewRevision:number;history:{action:string;actor:string;createdAt:string;status?:ResultStatus;reply?:CandidateReply}[];rubrics:Record<string,InterviewRubric>;result:RecruitmentResult};
type Stats={total:number;graded:number;inProgress:number};
const date=(value:string)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
class APIError extends Error{code:string;status:number;constructor(message:string,code:string,status:number){super(message);this.code=code;this.status=status;}}
async function api(path:string,init?:RequestInit){const response=await fetch(path,{cache:'no-store',...init});const data=await response.json();if(!response.ok)throw new APIError(data.error||'暂时无法载入，请重试。',data.code,response.status);return data;}
export default function ReviewDashboard({signInPath}:{signInPath:string}){
 const [conflict,setConflict]=useState(false),[denied,setDenied]=useState(false);
 const [stats,setStats]=useState<Stats|null>(null),[candidates,setCandidates]=useState<Candidate[]>([]),[page,setPage]=useState(1),[loading,setLoading]=useState(true),[sheet,setSheet]=useState<AnswerSheet|null>(null),[grades,setGrades]=useState<Record<string,Grade>>({}),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false),[detailBusy,setDetailBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const loadList=useCallback(async()=>{try{const data=await api('/api/interview/submissions?page='+page);setStats(data.stats);setCandidates(data.submissions);}catch(error){setError(error instanceof Error?error.message:'无法读取答卷。');if(error instanceof APIError&&(error.status===401||error.status===403)){setDenied(true);setCandidates([]);setSheet(null);setGrades({});setFeedback('');setStats(null);}}finally{setLoading(false);}},[page]);
 useEffect(()=>{
  const controller=new AbortController();
  void api('/api/interview/submissions?page='+page,{signal:controller.signal}).then(data=>{if(controller.signal.aborted)return;setStats(data.stats);setCandidates(data.submissions);}).catch(error=>{if(controller.signal.aborted)return;setError(error instanceof Error?error.message:'无法读取答卷。');if(error instanceof APIError&&(error.status===401||error.status===403)){setDenied(true);setCandidates([]);setSheet(null);setGrades({});setFeedback('');setStats(null);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[page]);
 async function openSheet(id:string,discard=false){if(dirty&&!discard){setError('当前评分尚未保存，请先保存或放弃修改，再切换答卷。');return;}setDetailBusy(true);setError('');setNotice('');try{const data=await api('/api/interview/submissions/'+id);setSheet(data.submission);setGrades(data.submission.grades);setFeedback(data.submission.feedback);setDirty(false);setConflict(false);}catch(error){setError(error instanceof Error?error.message:'无法打开答卷。');if(error instanceof APIError&&(error.status===401||error.status===403)){setDenied(true);setSheet(null);setCandidates([]);setGrades({});setFeedback('');setStats(null);}}finally{setDetailBusy(false);}}
 function changeGrade(id:string,change:Partial<Grade>){setGrades(current=>({...current,[id]:{...(current[id]??{score:null,comment:''}),...change}}));setDirty(true);setNotice('');}
 function markCriterion(id:string,partId:string,mark:number|null){
  const criteria=sheet?.rubrics[id]?.criteria;if(!criteria)return;
  setGrades(current=>{
   const grade=current[id]??{score:null,comment:''},marks={...grade.criteria,[partId]:mark};
   return {...current,[id]:{...grade,criteria:marks,score:criterionTotal(criteria,marks)}};
  });setDirty(true);setNotice('');
 }
 async function save(){if(!sheet||busy)return;setBusy(true);setError('');setNotice('');try{const data=await api('/api/interview/submissions/'+sheet.id+'/grade',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({grades,feedback,revision:sheet.reviewRevision})});setDirty(false);setConflict(false);setGrades(data.grades);setFeedback(data.feedback);setSheet({...sheet,grades:data.grades,feedback:data.feedback,totalScore:data.totalScore,reviewedAt:data.reviewedAt,reviewedBy:data.reviewedBy,reviewRevision:data.revision,history:[{action:'grade_saved',actor:data.reviewedBy,createdAt:data.reviewedAt},...sheet.history]});setNotice(data.complete?'评分已保存，总分 '+data.totalScore+' / 100。':'评分进度已保存，未打分的题目可以之后继续。');await loadList();}catch(error){setError(error instanceof Error?error.message:'保存失败，修改仍保留在页面中。');if(error instanceof APIError){if(error.code==='GRADE_CONFLICT')setConflict(true);if(error.status===401||error.status===403){setDenied(true);setSheet(null);setCandidates([]);setGrades({});setFeedback('');setStats(null);}}}finally{setBusy(false);}}
 const marked=sheet?.questions.filter(q=>typeof grades[q.id]?.score==='number').length??0,total=sheet?.questions.reduce((n,q)=>n+(sheet.rubrics[q.id]?.criteria?.reduce((sum,c)=>sum+(grades[q.id]?.criteria?.[c.id]??0),0)??grades[q.id]?.score??0),0)??0;
 if(denied)return <section className={s.accessGate}><h2>阅卷权限已失效</h2><p role="alert">{error}</p><a className={s.primaryLink} href={signInPath} target="_top">[ 重新登录授权账号 ]</a></section>;
 return <div>
  <div className={s.stats}>
   <div><span>已提交</span><strong>{stats?.total??'...'}</strong></div>
   <div><span>待评分</span><strong>{stats?stats.total-stats.graded:'...'}</strong></div>
   <div><span>已评分</span><strong>{stats?.graded??'...'}</strong></div>
  </div>
  <div className={s.reviewToolbar}>
   <span>{stats?.inProgress??0} 份正在评分</span>
   <button type="button" disabled={loading} onClick={()=>{setError('');setLoading(true);void loadList();}}>[ 刷新答卷 ]</button>
  </div>
  {error&&<p className={s.error} role="alert">{error}</p>}
  <div className={s.reviewLayout}>
   <section className={s.candidateList} aria-label="提交的答卷">
    <h2>答卷列表</h2>
    {loading&&<p className={s.muted}>正在读取…</p>}
    {!loading&&stats?.total===0&&<p className={s.empty}>还没有同学提交笔试。有人提交后，姓名、学号和答卷会出现在这里。</p>}
    {candidates.map(candidate=><button className={s.candidate} key={candidate.id} disabled={detailBusy||busy} aria-pressed={sheet?.id===candidate.id} onClick={()=>void openSheet(candidate.id)}>
     <span><strong>{candidate.name}</strong><small>{candidate.totalScore!==null?candidate.totalScore+' / 100':candidate.reviewedAt?'评分中':'待评分'}</small></span>
     <span>{candidate.studentId} · {candidate.track}</span>
     <span>{candidate.department} {candidate.year}</span>
     <time>{date(candidate.submittedAt)}</time>
     <span>用时：{durationLabel(candidate.elapsedSeconds)}</span>
     <span>{RESULT_LABELS[candidate.resultStatus]} · {replyLabel(candidate.resultStatus,candidate.candidateReply)}</span>
    </button>)}
    {stats&&stats.total>30&&<div className={s.pagination}>
     <button disabled={page===1||loading} onClick={()=>{setLoading(true);setPage(p=>p-1);}}>[ 上一页 ]</button>
     <span>{page} / {Math.ceil(stats.total/30)}</span>
     <button disabled={page*30>=stats.total||loading} onClick={()=>{setLoading(true);setPage(p=>p+1);}}>[ 下一页 ]</button>
    </div>}
   </section>
   <section className={s.markingDesk} aria-label="答卷和评分">
    {detailBusy?<p className={s.empty}>正在打开答卷…</p>:!sheet?<p className={s.empty}>选择一位同学，查看身份信息和完整答案。</p>:<>
     <header className={s.sheetHeader}>
      <p className={s.eyebrow}>ANSWER SHEET</p>
      <h2>{sheet.name} <span>{sheet.studentId}</span></h2>
      <p>{[sheet.department,sheet.year,sheet.track].filter(Boolean).join(' / ')}</p>
      <p>提交于 {date(sheet.submittedAt)}</p>
      <p>作答用时：{durationLabel(sheet.elapsedSeconds)}{sheet.startedAt&&' · 开始于 '+date(sheet.startedAt)}</p>
      <p>题库版本：{sheet.questionBankVersion}</p>
      {sheet.questions.some(isObjectiveQuestion)&&<p>客观题已按本卷答案自动计分。多选全对得满分，少选且无错选得一半，有错选得零分；保存时服务器会重新核算，分数不能手工改写。</p>}
      {sheet.questions.some(q=>q.parts)&&<p>主观题按本卷各项判据选满分、部分分或零分，同义表达同等计分。该题各项全部判定后生成本题分数，后端合计总分。可先保存评分进度。</p>}
     </header>
     <RecruitmentResultPanel key={sheet.id} id={sheet.id} totalScore={sheet.totalScore} reviewRevision={sheet.reviewRevision} result={sheet.result} disabled={busy||dirty} onSaved={result=>{setSheet(current=>current?.id===sheet.id?{...current,result}:current);void loadList();}} onRefresh={()=>void openSheet(sheet.id)}/>
     <fieldset className={s.formFields} disabled={busy}>
      {sheet.questions.map((q,i)=>{
       const rubric=sheet.rubrics[q.id],answer=sheet.answers[q.id],structured=q.parts&&rubric?.criteria,objective=isObjectiveQuestion(q);
       const optionText=(ids:string[])=>ids.map(id=>{const option=q.options?.find(item=>item.id===id);return option?(q.kind==='judgment'?option.text:id+' · '+option.text):id;}).join('；');
       return <article className={s.markingQuestion} key={q.id}>
       <h3><span className={s.number}>Q{String(i+1).padStart(2,'0')}</span> {q.title}</h3>
       <QuestionBrief question={q}/>
       {objective?<div className={s.objectiveReview}>
        <dl><dt>考生选择</dt><dd>{optionText(typeof answer==='string'?[answer]:Array.isArray(answer)?answer:[])||'未作答'}</dd><dt>正确答案</dt><dd>{optionText(rubric.objective?.correctOptions??[])}</dd><dt>计分说明</dt><dd>{q.kind==='multiple'?'全对满分；少选且无错选得一半；有错选零分。':'选对满分，选错零分。'}</dd></dl>
       </div>:structured?q.parts!.map((part,index)=>{
        const criterion=rubric.criteria!.find(item=>item.id===part.id)!;
        return <section className={s.markingPart} key={part.id}>
         <h4 className={s.partHeading}><span className={s.partNumber}>{index+1}</span>{part.label}<span className={s.points}> / {criterion.points} 分</span></h4>
         <p className={s.partPrompt}>{part.prompt}</p>
         <div className={s.answerText}>{answer&&typeof answer==='object'&&!Array.isArray(answer)?answer[part.id]:'未填写'}</div>
         <details className={s.criterionReference} open>
          <summary>评分判据</summary>
          <dl><dt>满分 · {criterion.points}</dt><dd>{criterion.full}</dd><dt>部分 · {criterion.points/2}</dt><dd>{criterion.partial}</dd><dt>零分 · 0</dt><dd>{criterion.zero}</dd></dl>
         </details>
         <label className={s.criterionSelect}>本步评分<select aria-label={'第 '+(i+1)+' 题 · '+part.label+'评分'} value={grades[q.id]?.criteria?.[part.id]??''} onChange={e=>markCriterion(q.id,part.id,e.target.value===''?null:Number(e.target.value))}>
          <option value="">尚未评分</option><option value={criterion.points}>满分 · {criterion.points}</option><option value={criterion.points/2}>部分 · {criterion.points/2}</option><option value={0}>零分 · 0</option>
         </select></label>
        </section>;
       }):<div className={s.answerText}>{typeof answer==='string'?answer:'未填写'}</div>}
       {rubric&&<details className={s.gradingReference}>
        <summary>[ 阅卷参考 ]</summary>
        <p><strong>观察点：</strong>{rubric.focus}</p>
        <p><strong>参考思路：</strong>{rubric.example}</p>
       </details>}
       <div className={s.gradeRow}>
        {objective?<span>自动得分：{grades[q.id]?.score??'待计分'} / {q.maxScore}</span>:structured?<span>本题合计：{grades[q.id]?.score??'待完成各项'} / {q.maxScore}</span>:<label>本题分数<input aria-label={'第 '+(i+1)+' 题分数'} type="number" min={0} max={q.maxScore} step="0.5" value={grades[q.id]?.score??''} onChange={e=>changeGrade(q.id,{score:e.target.value===''?null:Number(e.target.value)})}/><span>/ {q.maxScore}</span></label>}
        <span className={s.muted}>{objective?'服务器按本卷答案自动核算':structured?'分项分数由服务器核验合计':'旧版答卷按原标准评分，留空表示尚未评分'}</span>
       </div>
       <label className={s.commentLabel}>单题评语（整卷评分完成后学生可见）<textarea maxLength={1000} rows={2} value={grades[q.id]?.comment??''} onChange={e=>changeGrade(q.id,{comment:e.target.value})}/></label>
      </article>;})}
      <label className={s.commentLabel}>整份答卷总评（整卷评分完成后学生可见）<textarea maxLength={2000} rows={4} value={feedback} onChange={e=>{setFeedback(e.target.value);setDirty(true);setNotice('');}}/></label>
     </fieldset>
     <div className={s.saveBar}>
      <div><strong>暂计 {total} / 100</strong><span>已计分 {marked} / {sheet.questions.length} 题{dirty?' · 未保存':''}</span></div>
      <button disabled={busy||conflict} onClick={()=>void save()}>[ {busy?'正在保存…':marked===sheet.questions.length?'保存评分并开放成绩':'保存评分进度'} ]</button>
      {conflict&&<button disabled={busy||detailBusy} onClick={()=>void openSheet(sheet.id,true)}>[ 放弃当前修改，载入最新评分 ]</button>}
      {dirty&&<button disabled={busy} onClick={()=>{setGrades(sheet.grades);setFeedback(sheet.feedback);setDirty(false);setError('');}}>[ 放弃未保存修改 ]</button>}
     </div>
     {notice&&<p className={s.savedNotice} role="status">{notice}</p>}
     {sheet.reviewedAt&&<p className={s.muted}>上次保存：{date(sheet.reviewedAt)} · {sheet.reviewedBy}</p>}
     {sheet.history.length>0&&<details className={s.auditTrail}><summary>操作记录</summary><ul>{sheet.history.map((event,index)=><li key={index}>{date(event.createdAt)} · {({identity_bound:'绑定身份',submission_received:'提交答卷',grade_saved:'保存评分',device_released:'解除设备绑定',device_rebound:'重新绑定设备',result_published:'发布招新结果',result_withdrawn:'撤回招新结果',candidate_replied:'学生回复参加意愿'} as Record<string,string>)[event.action]??event.action}{event.status&&' · '+(event.action==='candidate_replied'?replyLabel(event.status,event.reply??null):RESULT_LABELS[event.status])} · {event.actor||'学生本人'}</li>)}</ul></details>}
    </>}
   </section>
  </div>
  <IdentityManagement/>
 </div>;
}
