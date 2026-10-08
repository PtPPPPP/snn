export type InterviewProfile={name:string;studentId:string;department:string;year:string};
export type InterviewReceipt={id:string;submittedAt:string;questionCount?:number};
export type InterviewSession={
 identity:(InterviewProfile&{id:string;createdAt:string})|null;
 receipt:InterviewReceipt|null;
 questionBankVersion:string;
};
