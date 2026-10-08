export interface InterviewStatement {
 bind(...values:unknown[]):InterviewStatement;
 first<T=Record<string,unknown>>():Promise<T|null>;
 all<T=Record<string,unknown>>():Promise<{results:T[]}>;
 run():Promise<{meta:{changes:number}}>;
}
export interface InterviewDatabase {
 prepare(sql:string):InterviewStatement;
 batch(statements:InterviewStatement[]):Promise<{meta:{changes:number}}[]>;
}
export interface InterviewEnv {DB?:InterviewDatabase;SNN_INTERVIEW_ADMIN_EMAILS?:string;SNN_INTERVIEW_ADMIN_USER_IDS?:string;SNN_INTERVIEW_SITE_ORIGIN?:string;}
export function interviewDatabase(env:InterviewEnv){if(!env.DB)throw new Error("Interview database unavailable");return env.DB;}
export function isInterviewReviewer(env:InterviewEnv,email:string|null,userId:string|null){
 if(!userId||!email)return false;
 const ids=env.SNN_INTERVIEW_ADMIN_USER_IDS?.split(',').map(value=>value.trim()).filter(Boolean);
 // A stable-ID allowlist, when configured, takes precedence over the legacy email list.
 if(ids?.length)return ids.includes(userId);
 return !!env.SNN_INTERVIEW_ADMIN_EMAILS?.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}
