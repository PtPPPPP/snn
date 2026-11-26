import {CASES,QUESTIONS,TRACKS,isObjectiveQuestion} from './questions.ts';
import type {InterviewAnswer} from './assessment.ts';

export type InterviewDraft={
 track:string;
 scenario:string;
 answers:Record<string,InterviewAnswer>;
 updatedAt:string;
};

export interface DraftStorage{
 getItem(key:string):string|null;
 setItem(key:string,value:string):void;
 removeItem(key:string):void;
}

export function interviewDraftKey(identityId:string,questionBankVersion:string):string{
 return `snn-interview-draft:${questionBankVersion}:${identityId}`;
}

export function sanitizeInterviewDraft(raw:unknown):InterviewDraft|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const record=raw as Record<string,unknown>;
 const track=typeof record.track==='string'&&TRACKS.some(item=>item.id===record.track)?record.track:'';
 const scenario=typeof record.scenario==='string'&&CASES.some(item=>item.id===record.scenario)?record.scenario:'';
 const rawAnswers=record.answers;
 const answers:Record<string,InterviewAnswer>={};
 if(rawAnswers&&typeof rawAnswers==='object'&&!Array.isArray(rawAnswers)){
  const answerRecord=rawAnswers as Record<string,unknown>;
  for(const question of QUESTIONS){
   const value=answerRecord[question.id];
   if(value===undefined)continue;
   if(isObjectiveQuestion(question)){
    const options=question.options??[];
    if(question.kind==='multiple'){
     if(Array.isArray(value)){
      const valid=Array.from(new Set(value.filter((id):id is string=>typeof id==='string'&&options.some(option=>option.id===id))));
      if(valid.length>0)answers[question.id]=valid;
     }
    }else if(typeof value==='string'&&options.some(option=>option.id===value)){
     answers[question.id]=value;
    }
   }else if(value&&typeof value==='object'&&!Array.isArray(value)){
    const partRecord=value as Record<string,unknown>;
    const cleanParts:Record<string,string>={};
    for(const part of question.parts??[]){
     const text=partRecord[part.id];
     if(typeof text==='string'&&text.length>0){
      cleanParts[part.id]=text.slice(0,part.maxLength);
     }
    }
    if(Object.keys(cleanParts).length>0)answers[question.id]=cleanParts;
   }
  }
 }
 const updatedAt=typeof record.updatedAt==='string'&&Number.isFinite(Date.parse(record.updatedAt))?record.updatedAt:new Date().toISOString();
 if(!track&&!scenario&&Object.keys(answers).length===0)return null;
 return {track,scenario,answers,updatedAt};
}

export function loadInterviewDraft(identityId:string,questionBankVersion:string,storage?:DraftStorage|null):InterviewDraft|null{
 const store=storage??(typeof window!=='undefined'?window.localStorage:null);
 if(!store||!identityId||!questionBankVersion)return null;
 try{
  const raw=store.getItem(interviewDraftKey(identityId,questionBankVersion));
  if(!raw)return null;
  return sanitizeInterviewDraft(JSON.parse(raw));
 }catch{
  return null;
 }
}

export function saveInterviewDraft(
 identityId:string,
 questionBankVersion:string,
 draft:{track:string;scenario:string;answers:Record<string,InterviewAnswer>},
 storage?:DraftStorage|null,
):InterviewDraft|null{
 const store=storage??(typeof window!=='undefined'?window.localStorage:null);
 if(!store||!identityId||!questionBankVersion)return null;
 try{
  const key=interviewDraftKey(identityId,questionBankVersion);
  const clean=sanitizeInterviewDraft({...draft,updatedAt:new Date().toISOString()});
  if(!clean){
   store.removeItem(key);
   return null;
  }
  store.setItem(key,JSON.stringify(clean));
  return clean;
 }catch{
  return null;
 }
}

export function clearInterviewDraft(identityId:string,questionBankVersion:string,storage?:DraftStorage|null):void{
 const store=storage??(typeof window!=='undefined'?window.localStorage:null);
 if(!store||!identityId||!questionBankVersion)return;
 try{
  store.removeItem(interviewDraftKey(identityId,questionBankVersion));
 }catch{}
}
