"use client";

import {createContext,useContext,useMemo,useRef,type ReactNode} from 'react';

export type LessonFlow = {
 read: (id:string) => unknown;
 publish: (id:string,snapshot:unknown) => void;
};

const standalone:LessonFlow={read:()=>undefined,publish:()=>{}};
const LessonFlowContext=createContext<LessonFlow>(standalone);

/** Checkpoints belong to this mounted article; reading always takes a private copy. */
export function LessonFlowProvider({children}:{children:ReactNode}) {
 const checkpoints=useRef(new Map<string,unknown>());
 const flow=useMemo<LessonFlow>(()=>({
  read(id){return checkpoints.current.has(id)?structuredClone(checkpoints.current.get(id)):undefined;},
  publish(id,snapshot){checkpoints.current.set(id,structuredClone(snapshot));},
 }),[]);
 return <LessonFlowContext.Provider value={flow}>{children}</LessonFlowContext.Provider>;
}

/** Snapshots describe only their own activity; no predecessor lookup or subscriptions. */
export function useLessonFlow():LessonFlow {return useContext(LessonFlowContext);}

/** Register a lesson's own initial snapshot when it is entered. */
export function onNotebookEntry(element:HTMLElement,enter:()=>void){
 const section=element.closest<HTMLElement>('[data-note]')??element;
 let finished=false,scheduled=0;
 const cleanup=()=>{cancelAnimationFrame(scheduled);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);section.removeEventListener('pointerdown',finish,true);section.removeEventListener('focusin',finish,true);};
 const finish=()=>{if(finished)return;finished=true;cleanup();enter();};
 const check=()=>{scheduled=0;const box=section.getBoundingClientRect();if(box.top<=Math.min(window.innerHeight*.3,220)&&box.bottom>0)finish();};
 function schedule(){if(!scheduled)scheduled=requestAnimationFrame(check);}
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);section.addEventListener('pointerdown',finish,true);section.addEventListener('focusin',finish,true);schedule();
 return cleanup;
}
