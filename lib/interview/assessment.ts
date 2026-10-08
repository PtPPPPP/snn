export type InterviewAnswer = string | string[] | Record<string,string>;
export type InterviewCriterion = {
 id:string;
 label:string;
 points:number;
 full:string;
 partial:string;
 zero:string;
};
export type InterviewRubric = {
 focus:string;
 example:string;
 follow?:string;
 criteria?:InterviewCriterion[];
 objective?:{correctOptions:string[]};
};
export type InterviewGrade = {
 score:number|null;
 comment:string;
 criteria?:Record<string,number|null>;
 automatic?:boolean;
};

// A question receives a score only when all of its criteria have been marked.
export function criterionTotal(criteria:InterviewCriterion[],marks:Record<string,number|null>):number|null{
 if(criteria.some(item=>typeof marks[item.id]!=='number'))return null;
 return criteria.reduce((total,item)=>total+marks[item.id]!,0);
}
