import type {Metadata} from 'next';
import StudentResultPanel from '../student-result';
import s from '../interview.module.css';
export const metadata:Metadata={title:'我的笔试成绩与招新结果 · SNN',description:'查看本人的笔试成绩、用时与复试通知，确认是否参加。'};
export const dynamic='force-dynamic';
export default function ResultPage(){return <main className={s.page}><StudentResultPanel/></main>;}
