'use client';
import {useEffect,useState} from 'react';
import {durationLabel} from '../../../lib/interview/results';
import s from './interview.module.css';

export default function AnswerTimer({startedAt,serverTime}:{startedAt:string;serverTime:string}){
 const [elapsed,setElapsed]=useState(Math.max(0,Math.floor((Date.parse(serverTime)-Date.parse(startedAt))/1000)));
 useEffect(()=>{
  const offset=Date.parse(serverTime)-Date.now();
  const tick=()=>setElapsed(Math.max(0,Math.floor((Date.now()+offset-Date.parse(startedAt))/1000)));
  tick();const timer=setInterval(tick,1000);return ()=>clearInterval(timer);
 },[startedAt,serverTime]);
 return <div className={s.answerTimer}><span>作答用时 <strong>{durationLabel(elapsed)}</strong></span><span>从开始到提交持续计时，刷新或离开页面也计入用时。</span></div>;
}
