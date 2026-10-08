"use client";
import { useEffect, useState } from 'react';
import { expireFeedback, initialFeedback, observeFeedback, sameObservation, type Observation } from '../../../lib/learning/local-feedback';
import s from './local-feedback.module.css';

export default function FeedbackMessage({ observation, summary, goalText, target }: { observation: Observation; summary: string; goalText: string; target?: number }) {
  const [state,setState]=useState(()=>initialFeedback(observation));
  // Adjust this component's pure observation state before rendering a new snapshot.
  // There is no effect-driven model update, focus change or page movement.
  if(!sameObservation(state.observation,observation))setState(observeFeedback(state,observation));
  useEffect(()=>{
    if(!state.active)return;
    const event=state.event,attempt=state.observation.attempt,timer=window.setTimeout(()=>setState(current=>expireFeedback(current,event,attempt)),1800);
    return()=>window.clearTimeout(timer);
  },[state.active,state.event,state.observation.attempt]);
  const flip=state.active&&state.kind==='flip';
  const message=observation.goal?goalText:flip?`所选点：预测 ${state.from} → ${observation.prediction}；真实类别 ${target}，当前${observation.prediction===target?'分对':'分错'}。`:summary;
  return <div className={s.message} data-feedback-active={state.active?state.kind:undefined} data-feedback-event={state.event} role="status" aria-live={state.active&&state.kind==='complete'?'polite':'off'}><span className={s.symbol} aria-hidden="true">{observation.goal?'✓':flip?'↔':'·'}</span><span>{message}</span></div>;
}

export function PredictionLegend({ hard }: { hard: boolean }) {
  return <span className={s.legend}><span className={s.scale}><span>预测 0</span><i aria-hidden="true"/><span>预测 1</span></span><span>{hard?'底色是阈值输出；点的形状和颜色是真实类别。':'底色随 p 从 0 到 1 渐变，不代表已校准的把握。'}</span></span>;
}
