import type {InterviewProfile,InterviewReceipt} from './session';

export type ResultStatus='pending'|'interview'|'not_selected';
export type CandidateReply='accept'|'decline';
export type RecruitmentResult={
 status:ResultStatus;
 message:string;
 publishedAt:string|null;
 revision:number;
 reply:CandidateReply|null;
 repliedAt:string|null;
};
export type StudentResult={
 profile:InterviewProfile;
 receipt:InterviewReceipt;
 score:{total:number;max:number;feedback:string;questions:{id:string;title:string;score:number;maxScore:number;comment:string}[]}|null;
 result:RecruitmentResult;
};
export const RESULT_LABELS:Record<ResultStatus,string>={pending:'复试结果待发布',interview:'已获得复试机会',not_selected:'本轮暂未进入复试'};
export const RESULT_MESSAGES:Record<ResultStatus,string>={
 pending:'负责人正在处理本轮招新结果，请稍后回来查看。',
 interview:'你已获得 SNN 下一轮复试机会。你是否愿意参加？请在下方确认，具体安排将由招新负责人告知。',
 not_selected:'感谢你完成本轮笔试。本轮暂未进入复试，你是否愿意参加下一次测试？请在下方留下你的意愿。',
};
export function replyLabel(status:ResultStatus,reply:CandidateReply|null){
 if(!reply)return '尚未回复';
 if(status==='interview')return reply==='accept'?'愿意参加复试':'放弃本次复试';
 if(status==='not_selected')return reply==='accept'?'愿意参加下一次测试':'暂不参加下一次测试';
 return '尚未回复';
}
export function durationLabel(seconds:number|null|undefined){
 if(seconds===null||seconds===undefined)return '未知（未记录开始时间）';
 const value=Math.max(0,Math.floor(seconds)),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),rest=value%60;
 return (hours?hours+' 小时 ':'')+minutes+' 分 '+rest+' 秒';
}
