import {isObjectiveQuestion,type InterviewQuestion} from '../../../lib/interview/questions';
import s from './interview.module.css';
export default function QuestionBrief({question}:{question:InterviewQuestion}){
 return <>{question.context&&<div className={s.questionContext}><p className={s.eyebrow}>{isObjectiveQuestion(question)?'题干':'给定材料与限制'}</p><ul>{question.context.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}{question.code&&<pre className={s.code}><code>{question.code}</code></pre>}{question.answerHint&&<p className={s.answerHint}>{question.answerHint}</p>}</>;
}
