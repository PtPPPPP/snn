import {CASES,COMMON_IDS,FORM_VERSION,OBJECTIVE_IDS,PAPER_QUESTION_COUNT,QUESTION_BANK_VERSION,QUESTIONS,TRACKS,isObjectiveQuestion,type InterviewQuestion} from '../lib/interview/questions.ts';
import {RUBRICS} from '../lib/interview/rubrics.ts';
import {LEGACY_BANK_VERSION,LEGACY_RUBRICS} from '../lib/interview/legacy-bank.ts';
import {criterionTotal,type InterviewAnswer,type InterviewGrade,type InterviewRubric} from '../lib/interview/assessment.ts';
import {interviewDatabase,isInterviewReviewer,type InterviewDatabase,type InterviewEnv} from '../lib/interview/database.ts';
import type {InterviewProfile} from '../lib/interview/session.ts';
import {RESULT_MESSAGES,type RecruitmentResult,type ResultStatus,type CandidateReply} from '../lib/interview/results.ts';

type User={id:string;email:string};
type LegacyInvitation={revoked_at:string|null};
type Identity={invitation_id:string|null;id:string;form_version:string;user_id:string;device_hash:string|null;applicant_name:string;student_id:string;department:string;year:string;created_at:string;started_at:string|null};
type Submission={id:string;form_version:string;question_bank_version:string;rubrics_json:string;identity_id:string|null;applicant_name:string;student_id:string;department:string;year:string;track:string;questions_json:string;answers_json:string;submitted_at:string;grades_json:string;total_score:number|null;feedback:string;reviewed_by:string;reviewed_at:string|null;review_revision:number;started_at:string|null;elapsed_seconds:number|null;result_status:ResultStatus;result_message:string;result_published_at:string|null;result_revision:number;candidate_reply:CandidateReply|null;candidate_replied_at:string|null};
const DEVICE_COOKIE='__Host-snn-interview-device';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES=100000;
class RequestError extends Error{
 status:number;code:string;
 constructor(message:string,status=400,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code;}
}
const json=(value:unknown,status=200,extra?:Record<string,string>)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, oai-authenticated-user-id, oai-authenticated-user-email','X-Content-Type-Options':'nosniff',...extra}});
function text(value:unknown,label:string,max:number,required=true){
 if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())throw new RequestError(label+'填写不完整或超出长度限制。');
 return value.trim();
}
function studentNumber(value:unknown){const number=text(value,'学号',32).normalize('NFKC').toUpperCase();if(!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(number))throw new RequestError('学号请填写 2–32 位字母、数字、短横线或下划线。');return number;}
function profile(data:Record<string,unknown>):InterviewProfile{
 const studentId=studentNumber(data.studentId);
 return {name:text(typeof data.name==='string'?data.name.normalize('NFKC'):data.name,'姓名',40),studentId,department:text(data.department??'','学院 / 专业',80,false),year:text(data.year??'','年级',16,false)};
}
function user(request:Request):User{
 // Sites dispatch supplies verified SIWC headers; browser fields are never identity claims.
 const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
 if(!id||!email)throw new RequestError('请先登录管理员账号。',401,'SIGN_IN_REQUIRED');
 return {id,email};
}
function reviewer(request:Request,env:InterviewEnv){
 const actor=user(request);
 if(!isInterviewReviewer(env,actor.email,actor.id))throw new RequestError('当前账号没有阅卷权限。',403,'REVIEW_FORBIDDEN');
 return actor;
}
async function body(request:Request,env:InterviewEnv):Promise<Record<string,unknown>>{
 const origin=request.headers.get('Origin'),fetchSite=request.headers.get('Sec-Fetch-Site');
 if(!origin||![new URL(request.url).origin,env.SNN_INTERVIEW_SITE_ORIGIN].includes(origin)||fetchSite&&fetchSite!=='same-origin'&&fetchSite!=='none')throw new RequestError('请从本站页面操作。',403,'ORIGIN_FORBIDDEN');
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new RequestError('请使用 JSON 提交。',415);
 if(Number(request.headers.get('Content-Length'))>MAX_BODY_BYTES)throw new RequestError('答卷过长，请缩短后再提交。',413);
 const reader=request.body?.getReader();if(!reader)throw new RequestError('提交内容为空。');
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY_BYTES){await reader.cancel();throw new RequestError('答卷过长，请缩短后再提交。',413);}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{const parsed=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed;}catch{throw new RequestError('提交内容格式有误。');}
}
function deviceToken(request:Request){
 const values=(request.headers.get('Cookie')??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(DEVICE_COOKIE+'='));
 if(values.length!==1)return null;
 const token=values[0].slice(DEVICE_COOKIE.length+1);return /^[a-f0-9]{64}$/.test(token)?token:null;
}
async function hash(token:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');}
function newDeviceToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('');}
function candidateActor(identity:Identity):User{return {id:'candidate:'+identity.id,email:''};}
async function checkLegacyIdentity(db:InterviewDatabase,identity:Identity){
 // Preserve an explicit prior suspension; old access codes and expiry are no longer entry requirements.
 if(!identity.invitation_id)return;
 const invitation=await db.prepare('SELECT revoked_at FROM interview_invitations WHERE id = ?').bind(identity.invitation_id).first<LegacyInvitation>();
 if(!invitation||invitation.revoked_at)throw new RequestError('此笔试身份已停用，请联系招新负责人。',403,'IDENTITY_DISABLED');
}
async function boundIdentity(request:Request,db:InterviewDatabase){
 const token=deviceToken(request);
 if(!token)throw new RequestError('浏览器绑定已丢失，请刷新页面。已登记过的身份请联系招新负责人。',428,'DEVICE_REQUIRED');
 const deviceHash=await hash(token),identity=await db.prepare('SELECT * FROM interview_identities WHERE form_version = ? AND device_hash = ?').bind(FORM_VERSION,deviceHash).first<Identity>();
 if(!identity)throw new RequestError('请先填写姓名和学号，绑定笔试身份。',428,'IDENTITY_REQUIRED');
 await checkLegacyIdentity(db,identity);
 return {identity,deviceHash,actor:candidateActor(identity)};
}
const receipt=(row:{id:string;submitted_at:string;questions_json?:string;started_at?:string|null;elapsed_seconds?:number|null})=>({id:row.id,submittedAt:row.submitted_at,startedAt:row.started_at??null,elapsedSeconds:row.elapsed_seconds??null,...row.questions_json?{questionCount:JSON.parse(row.questions_json).length}:{}});
function recruitmentResult(row:Submission):RecruitmentResult{return {status:row.result_status,message:row.result_message||RESULT_MESSAGES[row.result_status],publishedAt:row.result_published_at,revision:row.result_revision,reply:row.candidate_reply,repliedAt:row.candidate_replied_at};}
async function session(db:InterviewDatabase,identity:Identity|null){
 const submitted=identity?await db.prepare('SELECT id, submitted_at, questions_json, started_at, elapsed_seconds FROM interview_submissions WHERE identity_id = ?').bind(identity.id).first<Submission>():null;
 return {identity:identity?{id:identity.id,name:identity.applicant_name,studentId:identity.student_id,department:identity.department,year:identity.year,createdAt:identity.created_at}:null,receipt:submitted?receipt(submitted):null,questionBankVersion:QUESTION_BANK_VERSION,startedAt:identity?.started_at??null,serverTime:new Date().toISOString()};
}
function sameProfile(identity:Identity,data:InterviewProfile){return identity.applicant_name===data.name&&identity.student_id===data.studentId&&identity.department===data.department&&identity.year===data.year;}
function submissionRubrics(row:Submission):Record<string,InterviewRubric>{
 const snapshot:Record<string,InterviewRubric>=JSON.parse(row.rubrics_json);
 if(Object.keys(snapshot).length)return snapshot;
 if(row.question_bank_version===LEGACY_BANK_VERSION)return row.form_version===FORM_VERSION?LEGACY_RUBRICS:{};
 throw new Error('Missing rubric snapshot');
}
function automaticGrade(question:InterviewQuestion,answer:InterviewAnswer,rubric:InterviewRubric):InterviewGrade{
 const correct=rubric.objective?.correctOptions;
 if(!correct?.length)throw new Error('Missing objective answer snapshot');
 const chosen=typeof answer==='string'?[answer]:Array.isArray(answer)?answer:[];
 const wrong=chosen.some(id=>!correct.includes(id)),exact=!wrong&&chosen.length===correct.length&&correct.every(id=>chosen.includes(id));
 const score=exact?question.maxScore:question.kind==='multiple'&&!wrong&&chosen.length>0?question.maxScore/2:0;
 return {score,comment:'',automatic:true};
}

export async function interviewAPI(request:Request,env:InterviewEnv):Promise<Response>{
 try{
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
  if(path==='/api/interview/session'&&request.method==='GET'){
   const db=interviewDatabase(env),existingToken=deviceToken(request),token=existingToken??newDeviceToken(),deviceHash=await hash(token);
   const identity=await db.prepare('SELECT * FROM interview_identities WHERE form_version = ? AND device_hash = ?').bind(FORM_VERSION,deviceHash).first<Identity>();
   const state=await session(db,identity);
   if(identity)await checkLegacyIdentity(db,identity);
   return json(state,200,existingToken?{}:{'Set-Cookie':DEVICE_COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000'});
  }
  if(path==='/api/interview/identity'&&request.method==='POST'){
   const data=profile(await body(request,env)),db=interviewDatabase(env),token=deviceToken(request);
   if(!token)throw new RequestError('请先刷新页面以建立浏览器绑定。',428,'DEVICE_REQUIRED');
   const deviceHash=await hash(token);
   const rows=await db.prepare('SELECT * FROM interview_identities WHERE form_version = ? AND (student_id = ? OR device_hash = ?)').bind(FORM_VERSION,data.studentId,deviceHash).all<Identity>();
   const device=rows.results.find(row=>row.device_hash===deviceHash),existing=rows.results.find(row=>row.student_id===data.studentId);
   if(device&&device.student_id!==data.studentId)throw new RequestError('此浏览器已经绑定其他考生，本轮笔试不能切换身份。',409,'DEVICE_BOUND');
   if(existing){
    if(existing.device_hash!==deviceHash&&existing.device_hash!==null)throw new RequestError('此学号已在其他浏览器登记，请在原浏览器继续。需要更换时请联系招新负责人。',409,'DEVICE_MISMATCH');
    if(existing.applicant_name!==data.name)throw new RequestError('姓名与已登记的笔试身份不一致，请核对或联系招新负责人。',409,'IDENTITY_LOCKED');
    await checkLegacyIdentity(db,existing);
    const actor=candidateActor(existing);
    if(existing.device_hash===null){
     const result=await db.batch([
      db.prepare('INSERT INTO interview_audit_events (id, identity_id, action, actor_user_id, actor_email, details_json, created_at) SELECT ?, id, ?, ?, ?, ?, ? FROM interview_identities WHERE id = ? AND device_hash IS NULL AND (invitation_id IS NULL OR EXISTS (SELECT 1 FROM interview_invitations WHERE id = invitation_id AND revoked_at IS NULL))').bind(crypto.randomUUID(),'device_rebound',actor.id,'','{}',new Date().toISOString(),existing.id),
      db.prepare('UPDATE interview_identities SET device_hash = ? WHERE id = ? AND device_hash IS NULL AND (invitation_id IS NULL OR EXISTS (SELECT 1 FROM interview_invitations WHERE id = invitation_id AND revoked_at IS NULL))').bind(deviceHash,existing.id),
     ]);
     if(result[1].meta.changes!==1)throw new RequestError('身份状态已变化，请刷新页面。',409);
     existing.device_hash=deviceHash;
    }
    return json(await session(db,existing));
   }
   const id=crypto.randomUUID(),identity:Identity={id,invitation_id:null,form_version:FORM_VERSION,user_id:'public:'+id,device_hash:deviceHash,applicant_name:data.name,student_id:data.studentId,department:data.department,year:data.year,created_at:new Date().toISOString(),started_at:null},actor=candidateActor(identity);
   try{
    const result=await db.batch([
     db.prepare('INSERT INTO interview_identities (id, form_version, user_id, device_hash, applicant_name, student_id, department, year, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM interview_submissions WHERE form_version = ? AND UPPER(TRIM(student_id)) = ?)').bind(identity.id,FORM_VERSION,identity.user_id,deviceHash,data.name,data.studentId,data.department,data.year,identity.created_at,FORM_VERSION,data.studentId),
     db.prepare('INSERT INTO interview_audit_events (id, identity_id, invitation_id, action, actor_user_id, actor_email, details_json, created_at) SELECT ?, id, invitation_id, ?, ?, ?, ?, ? FROM interview_identities WHERE id = ?').bind(crypto.randomUUID(),'identity_bound',actor.id,'','{}',identity.created_at,identity.id),
    ]);
    if(result[0].meta.changes!==1)throw new RequestError('此学号已提交本轮笔试，不能重复登记。',409,'STUDENT_ALREADY_SUBMITTED');
   }catch(error){
    if(!String(error).includes('UNIQUE constraint'))throw error;
    const current=await db.prepare('SELECT * FROM interview_identities WHERE form_version = ? AND student_id = ?').bind(FORM_VERSION,data.studentId).first<Identity>();
    if(current?.device_hash===deviceHash&&current.applicant_name===data.name)return json(await session(db,current));
    throw new RequestError('浏览器或学号已经绑定本轮笔试，不能重复登记。',409,'IDENTITY_CONFLICT');
   }
   return json(await session(db,identity),201);
  }
  if(path==='/api/interview/start'&&request.method==='POST'){
   await body(request,env);
   const db=interviewDatabase(env),{identity,deviceHash}=await boundIdentity(request,db);
   const submitted=await db.prepare('SELECT id FROM interview_submissions WHERE identity_id = ?').bind(identity.id).first();
   if(submitted)throw new RequestError('本轮笔试已经提交，请查看成绩。',409,'ALREADY_SUBMITTED');
   const at=new Date().toISOString();
   const changed=await db.prepare('UPDATE interview_identities SET started_at = COALESCE(started_at, ?) WHERE id = ? AND device_hash = ? AND (invitation_id IS NULL OR EXISTS (SELECT 1 FROM interview_invitations WHERE id = invitation_id AND revoked_at IS NULL)) AND NOT EXISTS (SELECT 1 FROM interview_submissions WHERE identity_id = interview_identities.id)').bind(at,identity.id,deviceHash).run();
   if(changed.meta.changes!==1)throw new RequestError('身份状态已变化，请刷新页面。',409,'DEVICE_MISMATCH');
   const current=await db.prepare('SELECT started_at FROM interview_identities WHERE id = ?').bind(identity.id).first<{started_at:string}>();
   return json({startedAt:current!.started_at,serverTime:new Date().toISOString()});
  }
  if(path==='/api/interview/result'&&request.method==='GET'){
   const db=interviewDatabase(env),{identity}=await boundIdentity(request,db);
   const row=await db.prepare('SELECT * FROM interview_submissions WHERE identity_id = ?').bind(identity.id).first<Submission>();
   if(!row)throw new RequestError('你还没有提交本轮答卷。',404,'NOT_SUBMITTED');
   const questions:InterviewQuestion[]=JSON.parse(row.questions_json),grades:Record<string,InterviewGrade>=JSON.parse(row.grades_json);
   // Only the bound candidate's completed scores and public feedback are returned. No answer keys or reviewer identity.
   const score=row.total_score===null?null:{total:row.total_score,max:questions.reduce((sum,q)=>sum+q.maxScore,0),feedback:row.feedback,questions:questions.map(q=>({id:q.id,title:q.title,score:grades[q.id].score,maxScore:q.maxScore,comment:grades[q.id].comment}))};
   return json({profile:{name:row.applicant_name,studentId:row.student_id,department:row.department,year:row.year},receipt:receipt(row),score,result:recruitmentResult(row)});
  }
  if(path==='/api/interview/result/reply'&&request.method==='POST'){
   const data=await body(request,env),db=interviewDatabase(env),{identity,deviceHash,actor}=await boundIdentity(request,db);
   const row=await db.prepare('SELECT * FROM interview_submissions WHERE identity_id = ?').bind(identity.id).first<Submission>();
   if(!row)throw new RequestError('没有找到你的答卷。',404);
   if(!row.result_published_at||row.result_status==='pending')throw new RequestError('复试结果尚未发布，请稍后查看。',409,'RESULT_PENDING');
   if(!Number.isSafeInteger(data.revision)||data.revision!==row.result_revision)throw new RequestError('通知或回复已更新，请刷新后确认最新内容。',409,'RESULT_CONFLICT');
   if(data.reply!=='accept'&&data.reply!=='decline')throw new RequestError('请选择愿意参加或暂不参加。');
   const at=new Date().toISOString(),revision=row.result_revision+1;
   const condition='id = ? AND identity_id = ? AND result_revision = ? AND result_status = ? AND result_published_at IS NOT NULL AND EXISTS (SELECT 1 FROM interview_identities i WHERE i.id = identity_id AND i.device_hash = ? AND (i.invitation_id IS NULL OR EXISTS (SELECT 1 FROM interview_invitations v WHERE v.id = i.invitation_id AND v.revoked_at IS NULL)))';
   const args=[row.id,identity.id,row.result_revision,row.result_status,deviceHash];
   const result=await db.batch([
    db.prepare('INSERT INTO interview_audit_events (id, identity_id, submission_id, action, actor_user_id, actor_email, details_json, created_at) SELECT ?, identity_id, id, ?, ?, ?, ?, ? FROM interview_submissions WHERE '+condition).bind(crypto.randomUUID(),'candidate_replied',actor.id,'',JSON.stringify({status:row.result_status,reply:data.reply,revision}),at,...args),
    db.prepare('UPDATE interview_submissions SET candidate_reply = ?, candidate_replied_at = ?, result_revision = ? WHERE '+condition).bind(data.reply,at,revision,...args),
   ]);
   if(result[1].meta.changes!==1)throw new RequestError('通知或身份状态已变化，请刷新后重试。',409,'RESULT_CONFLICT');
   return json({result:recruitmentResult({...row,candidate_reply:data.reply,candidate_replied_at:at,result_revision:revision})});
  }
  if(path==='/api/interview/submissions'&&request.method==='POST'){
   const data=await body(request,env),db=interviewDatabase(env),{identity,deviceHash,actor}=await boundIdentity(request,db);
   if(data.identityId!==identity.id)throw new RequestError('答卷身份不匹配，请刷新页面。',403,'IDENTITY_MISMATCH');
   if(['name','studentId','department','year'].some(key=>key in data)&&!sameProfile(identity,profile(data)))throw new RequestError('答卷身份已锁定，不能伪造或更换身份信息。',409,'IDENTITY_LOCKED');
   // Retries return the original receipt even if the question bank has since changed.
   const existing=await db.prepare('SELECT id, submitted_at, questions_json, started_at, elapsed_seconds FROM interview_submissions WHERE identity_id = ?').bind(identity.id).first<Submission>();
   if(existing)return json({receipt:receipt(existing)});
   if(!identity.started_at)throw new RequestError('请刷新页面，开始计时后再提交。',409,'START_REQUIRED');
   if(data.questionBankVersion!==QUESTION_BANK_VERSION)throw new RequestError('题库已更新。请先复制保留当前回答，再刷新页面按新题作答。已提交的答卷不受影响。',409,'QUESTION_BANK_CHANGED');
   const track=TRACKS.find(item=>item.id===data.track),scenario=CASES.find(item=>item.id===data.scenario);
   if(!track||!scenario)throw new RequestError('请选择方向题和情景题。');
   const ids=[...OBJECTIVE_IDS,...COMMON_IDS,track.id,scenario.id],questions=ids.map(qid=>QUESTIONS.find(q=>q.id===qid)!);
   if(!data.answers||typeof data.answers!=='object'||Array.isArray(data.answers)||Object.keys(data.answers).some(id=>!ids.includes(id)))throw new RequestError('答题内容与所选试卷不匹配。');
   const inputAnswers=data.answers as Record<string,unknown>,answers=Object.fromEntries(questions.map((question,index)=>{
    const input=inputAnswers[question.id];
    if(isObjectiveQuestion(question)){
     const options=question.options!;
     if(question.kind==='multiple'){
      if(!Array.isArray(input)||!input.length||input.length>options.length||new Set(input).size!==input.length||input.some(id=>typeof id!=='string'||!options.some(option=>option.id===id)))throw new RequestError('第 '+(index+1)+' 题请选择有效且不重复的选项。');
      return [question.id,[...input].sort()];
     }
     if(typeof input!=='string'||!options.some(option=>option.id===input))throw new RequestError('第 '+(index+1)+' 题请选择一个选项。');
     return [question.id,input];
    }
    if(!input||typeof input!=='object'||Array.isArray(input))throw new RequestError('第 '+(index+1)+' 题请按指定步骤分别作答。');
    const values=input as Record<string,unknown>,parts=question.parts!;
    if(Object.keys(values).some(id=>!parts.some(part=>part.id===id)))throw new RequestError('答案包含不属于本题的步骤。');
    return [question.id,Object.fromEntries(parts.map(part=>[part.id,text(values[part.id],'第 '+(index+1)+' 题 · '+part.label,part.maxLength)]))];
   }));
   const rubrics=Object.fromEntries(ids.map(id=>[id,RUBRICS[id]]));
   const grades=Object.fromEntries(questions.filter(isObjectiveQuestion).map(question=>[question.id,automaticGrade(question,answers[question.id],rubrics[question.id])]));
   const submittedAt=new Date().toISOString(),elapsedSeconds=Math.max(0,Math.floor((Date.parse(submittedAt)-Date.parse(identity.started_at))/1000));
   try{
    const result=await db.batch([
     db.prepare('INSERT INTO interview_submissions (id, identity_id, form_version, applicant_name, student_id, department, year, track, question_bank_version, rubrics_json, questions_json, answers_json, grades_json, submitted_at, started_at, elapsed_seconds) SELECT id, id, form_version, applicant_name, student_id, department, year, ?, ?, ?, ?, ?, ?, ?, started_at, ? FROM interview_identities WHERE id = ? AND device_hash = ? AND started_at IS NOT NULL AND (invitation_id IS NULL OR EXISTS (SELECT 1 FROM interview_invitations WHERE id = invitation_id AND revoked_at IS NULL))').bind(track.label,QUESTION_BANK_VERSION,JSON.stringify(rubrics),JSON.stringify(questions),JSON.stringify(answers),JSON.stringify(grades),submittedAt,elapsedSeconds,identity.id,deviceHash),
     db.prepare('INSERT INTO interview_audit_events (id, identity_id, submission_id, action, actor_user_id, actor_email, details_json, created_at) SELECT ?, identity_id, id, ?, ?, ?, ?, ? FROM interview_submissions WHERE id = ? AND submitted_at = ?').bind(crypto.randomUUID(),'submission_received',actor.id,actor.email,'{}',submittedAt,identity.id,submittedAt),
    ]);
    if(result[0].meta.changes!==1)throw new RequestError('设备绑定已被解除，请刷新页面。',409,'DEVICE_MISMATCH');
   }catch(error){
    if(!String(error).includes('UNIQUE constraint'))throw error;
    const current=await db.prepare('SELECT id, submitted_at, questions_json, started_at, elapsed_seconds FROM interview_submissions WHERE identity_id = ?').bind(identity.id).first<Submission>();
    if(current)return json({receipt:receipt(current)});
    throw new RequestError('此学号已提交本轮笔试，不能重复提交。',409,'STUDENT_ALREADY_SUBMITTED');
   }
   return json({receipt:{id:identity.id,submittedAt,questionCount:PAPER_QUESTION_COUNT,startedAt:identity.started_at,elapsedSeconds}},201);
  }

  // Reviewer checks cover every remaining endpoint, including detail, grading and device release.
  const actor=reviewer(request,env),db=interviewDatabase(env);
  const page=Math.max(1,Math.min(100000,Math.floor(Number(url.searchParams.get('page'))||1))),offset=(page-1)*30;
  if(path==='/api/interview/identities'&&request.method==='GET'){
   const [count,list]=await Promise.all([
    db.prepare('SELECT COUNT(*) AS total FROM interview_identities WHERE form_version = ?').bind(FORM_VERSION).first<{total:number}>(),
    db.prepare('SELECT i.id, i.applicant_name AS name, i.student_id AS studentId, i.created_at AS createdAt, i.device_hash IS NOT NULL AS deviceBound, s.id AS submissionId FROM interview_identities i LEFT JOIN interview_submissions s ON s.identity_id = i.id WHERE i.form_version = ? ORDER BY i.created_at DESC, i.id DESC LIMIT 30 OFFSET ?').bind(FORM_VERSION,offset).all(),
   ]);
   return json({identities:list.results,total:count?.total??0,page,pageSize:30});
  }
  const release=path.match(/^\/api\/interview\/identities\/([^/]+)\/release-device$/);
  if(release&&UUID.test(release[1])&&request.method==='POST'){
   const data=await body(request,env),reason=text(data.reason,'解除绑定原因',500),identity=await db.prepare('SELECT * FROM interview_identities WHERE id = ?').bind(release[1]).first<Identity>();
   if(!identity||identity.form_version!==FORM_VERSION)throw new RequestError('没有找到可恢复的笔试身份。',404);
   if(identity.device_hash===null)throw new RequestError('设备绑定已经解除，可让本人重新填写原姓名和学号。',409);
   const at=new Date().toISOString();
   const result=await db.batch([
    db.prepare('INSERT INTO interview_audit_events (id, identity_id, invitation_id, action, actor_user_id, actor_email, details_json, created_at) SELECT ?, id, invitation_id, ?, ?, ?, ?, ? FROM interview_identities WHERE id = ? AND device_hash = ?').bind(crypto.randomUUID(),'device_released',actor.id,actor.email,JSON.stringify({reason}),at,identity.id,identity.device_hash),
    db.prepare('UPDATE interview_identities SET device_hash = NULL WHERE id = ? AND device_hash = ?').bind(identity.id,identity.device_hash),
   ]);
   if(result[1].meta.changes!==1)throw new RequestError('设备绑定状态已变化，请刷新后重试。',409);
   return json({released:true});
  }
  if(path==='/api/interview/submissions'&&request.method==='GET'){
   const [stats,list]=await Promise.all([
    db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN total_score IS NOT NULL THEN 1 ELSE 0 END) AS graded, SUM(CASE WHEN reviewed_at IS NOT NULL AND total_score IS NULL THEN 1 ELSE 0 END) AS inProgress FROM interview_submissions').first<{total:number;graded:number;inProgress:number}>(),
    db.prepare('SELECT id, applicant_name AS name, student_id AS studentId, department, year, track, submitted_at AS submittedAt, total_score AS totalScore, reviewed_at AS reviewedAt, started_at AS startedAt, elapsed_seconds AS elapsedSeconds, result_status AS resultStatus, candidate_reply AS candidateReply, candidate_replied_at AS candidateRepliedAt FROM interview_submissions ORDER BY submitted_at DESC, id DESC LIMIT 30 OFFSET ?').bind(offset).all(),
   ]);
   return json({stats:{total:stats?.total??0,graded:stats?.graded??0,inProgress:stats?.inProgress??0},submissions:list.results,page,pageSize:30,reviewer:actor.email});
  }
  const match=path.match(/^\/api\/interview\/submissions\/([^/]+)(\/grade|\/result)?$/);
  if(!match||!UUID.test(match[1]))throw new RequestError('接口不存在。',404);
  if(!(!match[2]&&request.method==='GET'||match[2]&&request.method==='PUT'))throw new RequestError('不支持这个操作。',405);
  const row=await db.prepare('SELECT * FROM interview_submissions WHERE id = ?').bind(match[1]).first<Submission>();
  if(!row)throw new RequestError('没有找到这份答卷。',404);
  if(match[2]==='/result'){
   const data=await body(request,env);
   if(!Number.isSafeInteger(data.revision)||data.revision!==row.result_revision||!Number.isSafeInteger(data.reviewRevision)||data.reviewRevision!==row.review_revision)throw new RequestError('评分、通知或学生回复已更新，请重新载入答卷后再发布。',409,'RESULT_CONFLICT');
   if(data.status!=='pending'&&data.status!=='interview'&&data.status!=='not_selected')throw new RequestError('请选择有效的招新结果。');
   const status=data.status as ResultStatus;
   if(status!=='pending'&&row.total_score===null)throw new RequestError('请先完成并保存整卷评分，再发布复试结果。',409,'GRADE_INCOMPLETE');
   if(status!=='pending'&&!row.identity_id)throw new RequestError('此答卷尚未关联学生身份，请先联系负责人处理身份关联。',409,'IDENTITY_REQUIRED');
   const message=status==='pending'?'':text(data.message??'','通知内容',2000,false),at=new Date().toISOString(),publishedAt=status==='pending'?null:at,revision=row.result_revision+1;
   const keepReply=status===row.result_status&&status!=='pending',reply=keepReply?row.candidate_reply:null,repliedAt=keepReply?row.candidate_replied_at:null;
   const condition='id = ? AND review_revision = ? AND result_revision = ?',args=[row.id,row.review_revision,row.result_revision];
   const result=await db.batch([
    db.prepare('INSERT INTO interview_audit_events (id, identity_id, submission_id, action, actor_user_id, actor_email, details_json, created_at) SELECT ?, identity_id, id, ?, ?, ?, ?, ? FROM interview_submissions WHERE '+condition).bind(crypto.randomUUID(),status==='pending'?'result_withdrawn':'result_published',actor.id,actor.email,JSON.stringify({status,message,revision,reviewRevision:row.review_revision,replyCleared:!keepReply&&row.candidate_reply!==null}),at,...args),
    db.prepare('UPDATE interview_submissions SET result_status = ?, result_message = ?, result_published_at = ?, result_revision = ?, candidate_reply = ?, candidate_replied_at = ? WHERE '+condition).bind(status,message,publishedAt,revision,reply,repliedAt,...args),
   ]);
   if(result[1].meta.changes!==1)throw new RequestError('评分或学生回复已变化，请重新载入答卷。',409,'RESULT_CONFLICT');
   return json({result:recruitmentResult({...row,result_status:status,result_message:message,result_published_at:publishedAt,result_revision:revision,candidate_reply:reply,candidate_replied_at:repliedAt})});
  }
  if(!match[2]){
   const history=await db.prepare("SELECT action, actor_email AS actor, created_at AS createdAt, json_extract(details_json, '$.status') AS status, json_extract(details_json, '$.reply') AS reply FROM interview_audit_events WHERE submission_id = ? OR (identity_id = ? AND submission_id IS NULL) ORDER BY created_at DESC, id DESC LIMIT 30").bind(row.id,row.identity_id).all();
   return json({submission:{id:row.id,identityId:row.identity_id,questionBankVersion:row.question_bank_version,name:row.applicant_name,studentId:row.student_id,department:row.department,year:row.year,track:row.track,submittedAt:row.submitted_at,startedAt:row.started_at,elapsedSeconds:row.elapsed_seconds,questions:JSON.parse(row.questions_json),answers:JSON.parse(row.answers_json),grades:JSON.parse(row.grades_json),totalScore:row.total_score,feedback:row.feedback,reviewedAt:row.reviewed_at,reviewedBy:row.reviewed_by,reviewRevision:row.review_revision,history:history.results,rubrics:submissionRubrics(row),result:recruitmentResult(row)}});
  }
  const data=await body(request,env),questions:InterviewQuestion[]=JSON.parse(row.questions_json),rubrics=submissionRubrics(row),answers:Record<string,InterviewAnswer>=JSON.parse(row.answers_json),grades:Record<string,InterviewGrade>={};
  if(!Number.isSafeInteger(data.revision)||data.revision!==row.review_revision)throw new RequestError('这份答卷的评分已更新，请重新打开答卷后再保存。你的修改仍保留在页面中。',409,'GRADE_CONFLICT');
  if(!data.grades||typeof data.grades!=='object'||Array.isArray(data.grades))throw new RequestError('评分内容格式有误。');
  const inputGrades=data.grades as Record<string,unknown>;
  if(Object.keys(inputGrades).some(id=>!questions.some(q=>q.id===id)))throw new RequestError('评分包含不属于本试卷的题目。');
  for(const q of questions){
   const item=inputGrades[q.id];
   if(item!==undefined&&(!item||typeof item!=='object'||Array.isArray(item)))throw new RequestError('单题评分格式有误。');
   const value=(item??{}) as Record<string,unknown>,comment=text(value.comment??'','单题评语',1000,false);
   if(isObjectiveQuestion(q)){
    const grade=automaticGrade(q,answers[q.id],rubrics[q.id]);
    if(value.score!==undefined&&value.score!==grade.score)throw new RequestError('客观题由服务器按本卷答案计分，不能改写分数。');
    grades[q.id]={...grade,comment};continue;
   }
   if(item===undefined)continue;
   const criteria=rubrics[q.id]?.criteria;
   if(criteria){
    const input=value.criteria??{};
    if(!input||typeof input!=='object'||Array.isArray(input))throw new RequestError('分项评分格式有误。');
    const marks=input as Record<string,unknown>;
    if(Object.keys(marks).some(id=>!criteria.some(criterion=>criterion.id===id)))throw new RequestError('评分包含不属于本题的评分点。');
    const validated:Record<string,number|null>={};
    for(const criterion of criteria){
     const mark=marks[criterion.id]??null;
     if(mark!==null&&(typeof mark!=='number'||![0,criterion.points/2,criterion.points].includes(mark)))throw new RequestError(criterion.label+'只能选择零分、部分分或满分。');
     validated[criterion.id]=mark as number|null;
    }
    const score=criterionTotal(criteria,validated);
    if(value.score!==undefined&&value.score!==score)throw new RequestError('本题分数必须等于各评分点的合计。');
    grades[q.id]={score,comment,criteria:validated};
   }else{
    const score=value.score;
    if(score!==null&&(typeof score!=='number'||!Number.isFinite(score)||score<0||score>q.maxScore||score*2%1!==0))throw new RequestError(q.title+'的分数应在 0 到 '+q.maxScore+' 之间，以 0.5 分为单位。');
    grades[q.id]={score:score as number|null,comment};
   }
  }
  const feedback=text(data.feedback??'','总评',2000,false),complete=questions.every(q=>typeof grades[q.id]?.score==='number'),totalScore=complete?questions.reduce((sum,q)=>sum+grades[q.id].score!,0):null,reviewedAt=new Date().toISOString(),revision=row.review_revision+1;
  // A transactional batch checks the same revision for the audit and update; competing saves cannot overwrite.
  const result=await db.batch([
   db.prepare('INSERT INTO interview_audit_events (id, identity_id, submission_id, action, actor_user_id, actor_email, details_json, created_at) SELECT ?, identity_id, id, ?, ?, ?, ?, ? FROM interview_submissions WHERE id = ? AND review_revision = ?').bind(crypto.randomUUID(),'grade_saved',actor.id,actor.email,JSON.stringify({revision,grades,feedback,totalScore}),reviewedAt,row.id,row.review_revision),
   db.prepare('UPDATE interview_submissions SET grades_json = ?, total_score = ?, feedback = ?, reviewed_by = ?, reviewed_by_user_id = ?, reviewed_at = ?, review_revision = ? WHERE id = ? AND review_revision = ?').bind(JSON.stringify(grades),totalScore,feedback,actor.email,actor.id,reviewedAt,revision,row.id,row.review_revision),
  ]);
  if(result[1].meta.changes!==1)throw new RequestError('其他阅卷人已更新评分，请重新打开答卷后再保存。',409,'GRADE_CONFLICT');
  return json({saved:true,totalScore,reviewedAt,complete,revision,grades,feedback,reviewedBy:actor.email});
 }catch(error){
  if(error instanceof RequestError)return json({error:error.message,code:error.code},error.status);
  console.error('Interview storage operation failed.',error instanceof Error?error.name:'UnknownError');
  return json({error:'暂时无法连接笔试服务，请稍后重试。已填写的内容仍保留在页面中。',code:'SERVICE_UNAVAILABLE'},503);
 }
}
