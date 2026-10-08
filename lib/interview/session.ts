export type InterviewProfile={name:string;studentId:string;department:string;year:string};
export type InterviewReceipt={id:string;submittedAt:string;questionCount?:number;startedAt?:string|null;elapsedSeconds?:number|null};
export type InterviewSession={
 identity:(InterviewProfile&{id:string;createdAt:string})|null;
 receipt:InterviewReceipt|null;
 questionBankVersion:string;
 startedAt:string|null;
 serverTime:string;
};
