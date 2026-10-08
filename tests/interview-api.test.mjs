import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {interviewAPI} from '../worker/interview-api.ts';
import {isInterviewReviewer} from '../lib/interview/database.ts';
import {CASES,COMMON_IDS,FORM_VERSION,OBJECTIVE_IDS,QUESTION_BANK_VERSION,QUESTIONS,TRACKS,isObjectiveQuestion} from '../lib/interview/questions.ts';
import {RUBRICS} from '../lib/interview/rubrics.ts';
import {LEGACY_BANK_VERSION,LEGACY_COMMON_IDS,LEGACY_QUESTIONS,LEGACY_RUBRICS} from '../lib/interview/legacy-bank.ts';
const origin='https://interview.example.test';
const admin={id:'reviewer-a',email:'reviewer@example.test'};
const ordinaryUser={id:'ordinary-user',email:'ordinary@example.test'};
const applicant={name:'测试同学',studentId:'20260001',department:'测试学院',year:'大一'};
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
function database(beforeUpgrade){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys = ON');
 for(const [index,name] of migrations.entries()){sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));if(index===0)beforeUpgrade?.(sqlite);}
 function statement(sql,values=[]){return {
  bind(...args){return statement(sql,args);},
  async first(){return sqlite.prepare(sql).get(...values)??null;},
  async all(){return {results:sqlite.prepare(sql).all(...values)};},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};},
  execute(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};},
 };}
 return {sqlite,prepare:statement,async batch(statements){
  sqlite.exec('BEGIN');try{const result=statements.map(value=>value.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}
 }};
}
function setup(t,beforeUpgrade){
 const db=database(beforeUpgrade);t.after(()=>db.sqlite.close());
 const env={DB:db,SNN_INTERVIEW_ADMIN_EMAILS:admin.email,SNN_INTERVIEW_SITE_ORIGIN:origin};
 async function request(path,{actor=null,method='GET',data,cookie,headers={},raw}={}){
  const h=new Headers(headers);
  if(actor){h.set('oai-authenticated-user-id',actor.id);h.set('oai-authenticated-user-email',actor.email);}
  if(cookie)h.set('Cookie',cookie);
  if(method!=='GET'){if(!h.has('Origin'))h.set('Origin',origin);if(!h.has('Content-Type'))h.set('Content-Type','application/json');}
  const response=await interviewAPI(new Request(origin+path,{method,headers:h,body:method==='GET'?undefined:raw??(data===undefined?undefined:JSON.stringify(data))}),env);
  return {status:response.status,data:await response.json(),headers:response.headers,cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
 }
 async function bind(info=applicant){
  const state=await request('/api/interview/session');assert.equal(state.status,200);
  const cookie=state.cookie,registered=await request('/api/interview/identity',{cookie,method:'POST',data:info});
  return {...registered,cookie};
 }
 const count=table=>db.sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
 return {db,env,request,bind,count};
}
function answers(identityId,overrides={}){
 const ids=[...OBJECTIVE_IDS,...COMMON_IDS,'q09','q13'];
 return {identityId,questionBankVersion:QUESTION_BANK_VERSION,track:'q09',scenario:'q13',answers:Object.fromEntries(ids.map(id=>{
  const q=QUESTIONS.find(item=>item.id===id);
  return [id,isObjectiveQuestion(q)?q.kind==='multiple'?[...RUBRICS[id].objective.correctOptions]:RUBRICS[id].objective.correctOptions[0]:Object.fromEntries(q.parts.map(part=>[part.id,'仅供测试的回答 '+id+' '+part.id]))];
 })),...overrides};
}
function fullGrades(questions,fraction=1){return Object.fromEntries(questions.map(q=>[q.id,isObjectiveQuestion(q)?{score:q.maxScore,comment:'评分测试',automatic:true}:{score:q.maxScore*fraction,comment:'评分测试',criteria:Object.fromEntries(RUBRICS[q.id].criteria.map(c=>[c.id,c.points*fraction]))}]));}
async function submitted(s){const identity=await s.bind();assert.equal(identity.status,201);const result=await s.request('/api/interview/submissions',{cookie:identity.cookie,method:'POST',data:answers(identity.data.identity.id)});assert.equal(result.status,201);return {...identity,id:result.data.receipt.id};}

test('group visitors register directly without ChatGPT, access codes or pre-created invitations',async t=>{
 const s=setup(t),state=await s.request('/api/interview/session');assert.equal(state.status,200);assert.equal(state.data.identity,null);assert.equal(state.data.receipt,null);assert.ok(state.cookie);
 const bound=await s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',data:applicant});
 assert.equal(bound.status,201);assert.equal(bound.data.identity.name,applicant.name);assert.equal(s.count('interview_invitations'),0);
 assert.equal(s.db.sqlite.prepare('SELECT invitation_id FROM interview_identities').get().invitation_id,null);
});
test('candidate registration never grants reviewer access; all private endpoints reject visitors',async t=>{
 const s=setup(t),bound=await s.bind(),id=bound.data.identity.id;
 for(const [path,method,data] of [
  ['/api/interview/submissions','GET'],['/api/interview/submissions/'+id,'GET'],['/api/interview/submissions/'+id+'/grade','PUT',{}],
  ['/api/interview/identities','GET'],['/api/interview/identities/'+id+'/release-device','POST',{reason:'test'}],
 ]){
  const denied=await s.request(path,{cookie:bound.cookie,method,data});assert.equal(denied.status,401);assert.ok(!JSON.stringify(denied.data).includes('rubrics'));
  assert.equal((await s.request(path,{actor:ordinaryUser,cookie:bound.cookie,method,data})).status,403);
 }
 assert.equal((await interviewAPI(new Request(origin+'/api/interview/submissions'),{})).status,401);
});
test('reviewer grants fail closed; configured stable user IDs take precedence over emails',()=>{
 assert.equal(isInterviewReviewer({},admin.email,admin.id),false);
 assert.equal(isInterviewReviewer({SNN_INTERVIEW_ADMIN_EMAILS:admin.email},admin.email,null),false);
 assert.equal(isInterviewReviewer({SNN_INTERVIEW_ADMIN_EMAILS:admin.email},admin.email,admin.id),true);
 const env={SNN_INTERVIEW_ADMIN_EMAILS:admin.email,SNN_INTERVIEW_ADMIN_USER_IDS:'stable-reviewer'};
 assert.equal(isInterviewReviewer(env,admin.email,admin.id),false);
 assert.equal(isInterviewReviewer(env,'other@example.test','stable-reviewer'),true);
});
test('registration validates profile and cookie; obsolete code issuance endpoints are removed',async t=>{
 const s=setup(t),state=await s.request('/api/interview/session');
 for(const data of [{studentId:applicant.studentId},{...applicant,name:' '},{...applicant,name:'字'.repeat(41)},{...applicant,studentId:'x'},{...applicant,studentId:'12<>34'},{...applicant,department:1}])
  assert.equal((await s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',data})).status,400);
 assert.equal((await s.request('/api/interview/identity',{method:'POST',data:applicant})).status,428);
 assert.equal((await s.request('/api/interview/invitations',{actor:admin,method:'POST',data:applicant})).status,404);
 assert.equal(s.count('interview_identities'),0);assert.equal(s.count('interview_invitations'),0);
});
test('identity is immutable; HttpOnly device credential is hashed and client roles are ignored',async t=>{
 const s=setup(t),state=await s.request('/api/interview/session');
 for(const value of ['__Host-','HttpOnly','Secure','SameSite=Lax','Path=/'])assert.ok(state.headers.get('Set-Cookie').includes(value));
 const data={...applicant,userId:admin.id,role:'admin'};
 const bound=await s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',data});assert.equal(bound.status,201);
 const row=s.db.sqlite.prepare('SELECT * FROM interview_identities').get();assert.equal(row.device_hash.length,64);assert.notEqual(row.device_hash,state.cookie.split('=')[1]);assert.notEqual(row.user_id,admin.id);
 const retry=await s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',data});assert.equal(retry.status,200);assert.equal(retry.data.identity.id,bound.data.identity.id);assert.equal(s.count('interview_identities'),1);
 assert.equal((await s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',data:{...data,name:'更改姓名'}})).status,409);
 const refreshed=await s.request('/api/interview/session',{cookie:state.cookie});assert.equal(refreshed.data.identity.id,row.id);assert.equal(refreshed.headers.get('Set-Cookie'),null);
 assert.equal((await s.request('/api/interview/submissions',{cookie:state.cookie})).status,401);
});
test('same browser cannot switch identity; a new browser cannot claim an existing student number',async t=>{
 const s=setup(t),bound=await s.bind();
 const switched=await s.request('/api/interview/identity',{cookie:bound.cookie,method:'POST',data:{...applicant,name:'另一同学',studentId:'20260002'}});
 assert.equal(switched.status,409);assert.equal(switched.data.code,'DEVICE_BOUND');
 const fresh=await s.request('/api/interview/session');assert.equal(fresh.data.identity,null);assert.ok(!JSON.stringify(fresh.data).includes(applicant.studentId));
 const reused=await s.request('/api/interview/identity',{cookie:fresh.cookie,method:'POST',data:applicant});
 assert.equal(reused.status,409);assert.equal(reused.data.code,'DEVICE_MISMATCH');assert.ok(!JSON.stringify(reused.data).includes(applicant.name));
});
test('concurrent registration enforces browser and normalized student uniqueness without admission codes',async t=>{
 for(const kind of ['student','browser','normalized']){
  const s=setup(t),first=await s.request('/api/interview/session'),second=await s.request('/api/interview/session');
  const one={...applicant,studentId:kind==='normalized'?'ab1234':applicant.studentId};
  const two={...applicant,studentId:kind==='browser'?'20260002':kind==='normalized'?'ＡＢ１２３４':applicant.studentId};
  const requests=[{cookie:first.cookie,method:'POST',data:one},{cookie:kind==='browser'?first.cookie:second.cookie,method:'POST',data:two}];
  const results=await Promise.all(requests.map(value=>s.request('/api/interview/identity',value)));assert.deepEqual(results.map(result=>result.status).sort(),[201,409]);assert.equal(s.count('interview_identities'),1);
  assert.equal(s.count('interview_invitations'),0);
 }
});
test('submission rejects unbound sessions, forged identity/profile and incomplete or foreign questions',async t=>{
 const s=setup(t),unbound=await s.request('/api/interview/session');
 assert.equal((await s.request('/api/interview/submissions',{cookie:unbound.cookie,method:'POST',data:answers(crypto.randomUUID())})).status,428);
 const bound=await s.bind(),id=bound.data.identity.id;
 assert.equal((await s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data:answers(crypto.randomUUID())})).status,403);
 assert.equal((await s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data:answers(id,{...applicant,name:'伪造的名字'})})).status,409);
 assert.equal((await s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data:answers(id,{answers:{q01:'incomplete'}})})).status,400);
 assert.equal(s.count('interview_submissions'),0);
});
test('concurrent and repeated submissions keep one answer sheet, audit record and receipt',async t=>{
 const s=setup(t),bound=await s.bind(),id=bound.data.identity.id,data=answers(id);
 const results=await Promise.all([1,2].map(()=>s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data})));
 assert.deepEqual(results.map(result=>result.status).sort(),[200,201]);assert.deepEqual(results[0].data.receipt,results[1].data.receipt);assert.equal(results[0].data.receipt.id,id);assert.equal(s.count('interview_submissions'),1);
 const before=s.db.sqlite.prepare('SELECT answers_json FROM interview_submissions').get().answers_json;
 assert.equal((await s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data:answers(id,{answers:{...data.answers,q01:'修改后的回答'}})})).status,200);
 assert.equal(s.db.sqlite.prepare('SELECT answers_json FROM interview_submissions').get().answers_json,before);
 const state=await s.request('/api/interview/session',{cookie:bound.cookie});assert.deepEqual(state.data.receipt,results[0].data.receipt);assert.equal(state.data.answers,undefined);assert.equal(state.data.grades,undefined);
 assert.equal(s.db.sqlite.prepare("SELECT COUNT(*) AS n FROM interview_audit_events WHERE action = 'submission_received'").get().n,1);
});
test('trusted reviewer reads rubric and grades; score bounds and stale revisions are checked by server',async t=>{
 const s=setup(t),bound=await submitted(s),detail=await s.request('/api/interview/submissions/'+bound.id,{actor:admin});assert.equal(detail.status,200);assert.ok(detail.data.submission.rubrics.q01);
 const path='/api/interview/submissions/'+bound.id+'/grade';
 for(const grades of [{q01:{score:11}},{q01:{score:-1}},{q01:{score:.25}},{fake:{score:1}},{q01:'invalid'}])assert.equal((await s.request(path,{actor:admin,method:'PUT',data:{revision:0,grades}})).status,400);
 const grades=fullGrades(detail.data.submission.questions);
 const saved=await s.request(path,{actor:admin,method:'PUT',data:{revision:0,grades,feedback:'完成'}});assert.equal(saved.status,200);assert.equal(saved.data.totalScore,100);assert.equal(saved.data.revision,1);
 assert.equal((await s.request(path,{actor:admin,method:'PUT',data:{revision:0,grades:{}}})).status,409);
 const audit=s.db.sqlite.prepare("SELECT * FROM interview_audit_events WHERE action = 'grade_saved'").all();assert.equal(audit.length,1);assert.equal(audit[0].actor_user_id,admin.id);
});
test('concurrent graders cannot overwrite newer grades or append a false audit entry',async t=>{
 const s=setup(t),bound=await submitted(s),path='/api/interview/submissions/'+bound.id+'/grade';
 const results=await Promise.all([2.5,5].map(mark=>s.request(path,{actor:admin,method:'PUT',data:{revision:0,grades:{q01:{score:null,criteria:{p1:mark},comment:'测试'}}}})));assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 const row=s.db.sqlite.prepare('SELECT review_revision,total_score FROM interview_submissions').get();assert.equal(row.review_revision,1);assert.equal(row.total_score,null);
 assert.equal(s.db.sqlite.prepare("SELECT COUNT(*) AS n FROM interview_audit_events WHERE action = 'grade_saved'").get().n,1);
});
test('authorized device recovery requires no code and preserves original identity and submitted sheet',async t=>{
 const s=setup(t),bound=await submitted(s),id=bound.id,path='/api/interview/identities/'+id+'/release-device';
 assert.equal((await s.request(path,{method:'POST',data:{reason:'test'}})).status,401);
 assert.equal((await s.request(path,{actor:admin,method:'POST',data:{reason:''}})).status,400);
 const released=await s.request(path,{actor:admin,method:'POST',data:{reason:'已核实本人，浏览器被清空'}});assert.equal(released.status,200);assert.equal(released.data.accessCode,undefined);
 const oldSession=await s.request('/api/interview/session',{cookie:bound.cookie});assert.equal(oldSession.data.identity,null);
 const fresh=await s.request('/api/interview/session');
 assert.equal((await s.request('/api/interview/identity',{cookie:fresh.cookie,method:'POST',data:{...applicant,name:'不匹配'}})).status,409);
 const rebound=await s.request('/api/interview/identity',{cookie:fresh.cookie,method:'POST',data:{name:applicant.name,studentId:applicant.studentId}});
 assert.equal(rebound.status,200);assert.equal(rebound.data.identity.id,id);assert.equal(rebound.data.identity.department,applicant.department);assert.ok(rebound.data.receipt);assert.equal(s.count('interview_submissions'),1);
 assert.equal((await s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data:answers(id)})).status,428);
 const detail=await s.request('/api/interview/submissions/'+id,{actor:admin});assert.ok(detail.data.submission.history.some(event=>event.action==='device_released'));
});
test('existing code-linked identities continue without codes or expiry while explicit suspensions remain',async t=>{
 const s=setup(t),bound=await submitted(s),legacyId=crypto.randomUUID();
 s.db.sqlite.prepare('INSERT INTO interview_invitations (id,form_version,code_hash,applicant_name,student_id,created_at,code_issued_at,expires_at,issued_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)').run(legacyId,FORM_VERSION,'0'.repeat(64),applicant.name,applicant.studentId,'2000','2000','2000',admin.id);
 s.db.sqlite.prepare('UPDATE interview_identities SET invitation_id = ? WHERE id = ?').run(legacyId,bound.id);
 const current=await s.request('/api/interview/session',{cookie:bound.cookie});assert.equal(current.status,200);assert.equal(current.data.receipt.id,bound.id);
 const reentered=await s.request('/api/interview/identity',{cookie:bound.cookie,method:'POST',data:applicant});assert.equal(reentered.status,200);assert.equal(reentered.data.identity.id,bound.id);
 s.db.sqlite.prepare('UPDATE interview_invitations SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(),legacyId);
 assert.equal((await s.request('/api/interview/session',{cookie:bound.cookie})).status,403);
 assert.equal((await s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data:answers(bound.id)})).status,403);
});
test('cross-origin, invalid content types, malformed and oversized bodies never change enrollment',async t=>{
 const s=setup(t),state=await s.request('/api/interview/session');
 for(const headers of [{'Origin':'https://evil.example.test'},{'Sec-Fetch-Site':'cross-site'},{'Content-Type':'text/plain'}]){
  const result=await s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',data:applicant,headers});assert.ok([403,415].includes(result.status));
 }
 assert.equal((await s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',raw:'{bad json'})).status,400);
 assert.equal((await s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',raw:JSON.stringify({name:'汉'.repeat(40000)})})).status,413);assert.equal(s.count('interview_identities'),0);
});
test('maximum-length Chinese parts fit the byte limit and all twelve subjective parts are persisted',async t=>{
 const s=setup(t),bound=await s.bind(),data=answers(bound.data.identity.id);
 for(const id of Object.keys(data.answers))for(const part of (QUESTIONS.find(q=>q.id===id).parts??[]))data.answers[id][part.id]='汉'.repeat(part.maxLength);
 assert.equal((await s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data})).status,201);
 const row=s.db.sqlite.prepare('SELECT answers_json FROM interview_submissions').get(),saved=JSON.parse(row.answers_json);assert.equal(Object.keys(saved).length,12);assert.equal(Object.values(saved).reduce((sum,value)=>sum+(value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).length:0),0),12);
});
test('legacy sheets remain readable and already submitted students cannot register again',async t=>{
 const id=crypto.randomUUID(),qs=LEGACY_QUESTIONS.filter(q=>[...LEGACY_COMMON_IDS,'q09','q13'].includes(q.id)),legacyAnswers=Object.fromEntries(qs.map(q=>[q.id,'旧版自由回答 '+q.id])),legacyGrades={q01:{score:4.5,comment:'旧版评语'}};
 const s=setup(t,sqlite=>sqlite.prepare('INSERT INTO interview_submissions (id,form_version,applicant_name,student_id,track,questions_json,answers_json,submitted_at,grades_json) VALUES (?,?,?,?,?,?,?,?,?)').run(id,FORM_VERSION,'旧版考生','old123','AI',JSON.stringify(qs),JSON.stringify(legacyAnswers),new Date().toISOString(),JSON.stringify(legacyGrades)));
 assert.equal((await s.bind({...applicant,studentId:'OLD123'})).status,409);assert.equal(s.count('interview_submissions'),1);assert.equal(s.count('interview_identities'),0);
 const detail=await s.request('/api/interview/submissions/'+id,{actor:admin});assert.equal(detail.status,200);assert.equal(detail.data.submission.identityId,null);assert.equal(detail.data.submission.reviewRevision,0);
 assert.equal(detail.data.submission.questionBankVersion,LEGACY_BANK_VERSION);assert.deepEqual(detail.data.submission.questions,qs);assert.deepEqual(detail.data.submission.answers,legacyAnswers);assert.deepEqual(detail.data.submission.grades,legacyGrades);
 assert.equal(detail.data.submission.rubrics.q01.focus,LEGACY_RUBRICS.q01.focus);assert.equal(detail.data.submission.rubrics.q01.criteria,undefined);
 const updated=await s.request('/api/interview/submissions/'+id+'/grade',{actor:admin,method:'PUT',data:{revision:0,grades:{q01:{score:5.5,comment:'仍按旧标准'}}}});assert.equal(updated.status,200);assert.equal(updated.data.grades.q01.score,5.5);
});

test('concurrent retries from the same browser keep one identity and binding audit',async t=>{
 const s=setup(t),state=await s.request('/api/interview/session');
 const results=await Promise.all([1,2].map(()=>s.request('/api/interview/identity',{cookie:state.cookie,method:'POST',data:applicant})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(results[0].data.identity.id,results[1].data.identity.id);assert.equal(s.count('interview_identities'),1);
 assert.equal(s.db.sqlite.prepare("SELECT COUNT(*) AS n FROM interview_audit_events WHERE action = 'identity_bound'").get().n,1);
});
test('concurrent admin recovery records exactly one release operation',async t=>{
 const s=setup(t),bound=await s.bind(),path='/api/interview/identities/'+bound.data.identity.id+'/release-device';
 const results=await Promise.all([1,2].map(()=>s.request(path,{actor:admin,method:'POST',data:{reason:'已核实本人'}})));
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 assert.equal(s.db.sqlite.prepare("SELECT COUNT(*) AS n FROM interview_audit_events WHERE action = 'device_released'").get().n,1);
});

test('every selectable mixed paper has twelve questions and the same 40 plus 60 point structure',()=>{
 assert.equal(QUESTIONS.length,18);assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,18);
 for(const track of TRACKS)for(const scenario of CASES){
  const qs=[...OBJECTIVE_IDS,...COMMON_IDS,track.id,scenario.id].map(id=>QUESTIONS.find(q=>q.id===id));
  assert.equal(qs.length,12);assert.equal(qs.reduce((n,q)=>n+q.maxScore,0),100);
  for(const q of qs){
   assert.ok(q.context.length>=1);
   if(isObjectiveQuestion(q)){assert.equal(q.maxScore,5);assert.ok(RUBRICS[q.id].objective.correctOptions.every(id=>q.options.some(option=>option.id===id)));continue;}
   assert.equal(q.parts.length,q.maxScore===10?2:4);
   assert.deepEqual(q.parts.map(p=>p.id),RUBRICS[q.id].criteria.map(c=>c.id));
   assert.equal(RUBRICS[q.id].criteria.reduce((n,c)=>n+c.points,0),q.maxScore);
   assert.deepEqual(RUBRICS[q.id].criteria.map(c=>c.points),q.maxScore===10?[5,5]:[5,5,5,5]);
   assert.ok(q.parts.every(p=>p.maxLength>=80&&p.maxLength<=180));
   assert.ok(RUBRICS[q.id].criteria.every(c=>c.full&&c.partial&&c.zero));
  }
 }
});

test('new submissions require the matching bank and the declared bounded answer parts',async t=>{
 const s=setup(t),bound=await s.bind(),id=bound.data.identity.id;
 const call=data=>s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data});
 for(const version of [undefined,LEGACY_BANK_VERSION,'future-bank']){
  const result=await call(answers(id,{questionBankVersion:version}));assert.equal(result.status,409);assert.equal(result.data.code,'QUESTION_BANK_CHANGED');
 }
 for(const invalid of [
  '自由发散回答',[],null,{p1:'只写第一步'},
  {p1:'有效',p2:' ',p3:'有效',p4:'有效'},
  {p1:'有效',p2:7,p3:'有效',p4:'有效'},
  {p1:'有效',p2:'有效',p3:'有效',p4:'有效',extra:'题外部分'},
  {p1:'汉'.repeat(121),p2:'有效',p3:'有效',p4:'有效'}
 ]){
  const data=answers(id);data.answers.q01=invalid;assert.equal((await call(data)).status,400);
 }
 const foreign=answers(id);foreign.answers.q10=foreign.answers.q09;assert.equal((await call(foreign)).status,400);
 const longNotice=answers(id);longNotice.answers.q13.p4='汉'.repeat(101);assert.equal((await call(longNotice)).status,400);
 assert.equal(s.count('interview_submissions'),0);
 const accepted=await call(answers(id));assert.equal(accepted.status,201);
 const retry=await call({identityId:id,questionBankVersion:LEGACY_BANK_VERSION,answers:'old draft'});assert.equal(retry.status,200);assert.deepEqual(retry.data.receipt,accepted.data.receipt);
});

test('the server stores its own questions and rubric snapshot without leaking private scoring',async t=>{
 const s=setup(t),bound=await s.bind(),id=bound.data.identity.id;
 const received=await s.request('/api/interview/submissions',{cookie:bound.cookie,method:'POST',data:answers(id,{questions:[{maxScore:999}],rubrics:{q01:{example:'forged'}}})});assert.equal(received.status,201);
 const row=s.db.sqlite.prepare('SELECT * FROM interview_submissions').get(),snapshot=JSON.parse(row.rubrics_json);
 assert.equal(row.question_bank_version,QUESTION_BANK_VERSION);assert.equal(Object.keys(snapshot).length,12);assert.deepEqual(snapshot.q01,RUBRICS.q01);
 assert.equal(JSON.parse(row.questions_json)[0].title,QUESTIONS[0].title);
 const publicState=await s.request('/api/interview/session',{cookie:bound.cookie});
 for(const data of [received.data,publicState.data])for(const privateField of ['rubrics','answers','grades'])assert.equal(data[privateField],undefined);
 // Simulate the live bank changing after submission: the saved sheet retains its original reference.
 const original=RUBRICS.q01.focus;RUBRICS.q01.focus='下一版评分说明';
 try{const detail=await s.request('/api/interview/submissions/'+id,{actor:admin});assert.equal(detail.data.submission.rubrics.q01.focus,original);}finally{RUBRICS.q01.focus=original;}
});

test('criterion marks are constrained, server summed, and partial progress survives reopening',async t=>{
 const s=setup(t),bound=await submitted(s),path='/api/interview/submissions/'+bound.id+'/grade';
 const call=grades=>s.request(path,{actor:admin,method:'PUT',data:{revision:0,grades}});
 for(const grade of [
  {criteria:{p1:1}},{criteria:{p1:-1}},{criteria:{p1:4}},{criteria:{p1:'3'}},{criteria:{p5:3}},
  {criteria:[]},{score:10},{score:0,criteria:{p1:3,p2:3,p3:2,p4:2}}
 ])assert.equal((await call({q01:grade})).status,400);
 assert.equal((await call({q09:{criteria:{p1:1.5}}})).status,400);
 const partial=await call({q01:{criteria:{p1:5},comment:'后续继续'}});assert.equal(partial.status,200);assert.equal(partial.data.totalScore,null);assert.equal(partial.data.complete,false);
 assert.deepEqual(partial.data.grades.q01,{score:null,comment:'后续继续',criteria:{p1:5,p2:null}});
 const detail=await s.request('/api/interview/submissions/'+bound.id,{actor:admin});assert.deepEqual(detail.data.submission.grades,partial.data.grades);
 const grades=fullGrades(detail.data.submission.questions,.5);delete grades.q01.score;
 const saved=await s.request(path,{actor:admin,method:'PUT',data:{revision:1,grades}});assert.equal(saved.status,200);assert.equal(saved.data.totalScore,70);assert.equal(saved.data.grades.q01.score,5);assert.equal(saved.data.complete,true);
 const zero=fullGrades(detail.data.submission.questions,0);
 const savedZero=await s.request(path,{actor:admin,method:'PUT',data:{revision:2,grades:zero}});assert.equal(savedZero.status,200);assert.equal(savedZero.data.totalScore,40);
});
