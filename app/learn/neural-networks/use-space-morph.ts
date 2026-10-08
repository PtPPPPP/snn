"use client";
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
export function useSpaceMorph(root:RefObject<HTMLElement|null>){
 const [position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[target,setTarget]=useState(2),[reduced,setReduced]=useState(false),current=useRef(0),visible=useRef(true);
 const set=useCallback((p:number)=>{current.current=p;setPosition(p);},[]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>{setReduced(media.matches);if(media.matches)setPlaying(false);};const preferenceFrame=requestAnimationFrame(change);media.addEventListener('change',change);const observer=new IntersectionObserver(([entry])=>{visible.current=entry.isIntersecting;if(!entry.isIntersecting)setPlaying(false);});if(root.current)observer.observe(root.current);const hidden=()=>{if(document.hidden)setPlaying(false);};document.addEventListener('visibilitychange',hidden);return()=>{cancelAnimationFrame(preferenceFrame);observer.disconnect();media.removeEventListener('change',change);document.removeEventListener('visibilitychange',hidden);};},[root]);
 useEffect(()=>{if(!playing||reduced)return;let handle=0,last=performance.now(),accumulated=0;const tick=(now:number)=>{const delta=Math.min(64,now-last);last=now;accumulated+=delta;if(accumulated>=32&&visible.current&&!document.hidden){const step=accumulated/1800;accumulated=0;const old=current.current,next=old<target?Math.min(target,old+step):Math.max(target,old-step);set(next);if(next===target){setPlaying(false);return;}}handle=requestAnimationFrame(tick);};handle=requestAnimationFrame(tick);return()=>cancelAnimationFrame(handle);},[playing,target,reduced,set]);
 const go=(next:0|1|2)=>{setPlaying(false);setTarget(next);if(reduced)set(next);else if(Math.abs(current.current-next)>1e-9)setPlaying(true);};
 const scrub=(p:number)=>{setPlaying(false);const bounded=Math.max(0,Math.min(2,p));set(bounded);setTarget(bounded<1?1:2);};
 const play=()=>{if(playing){setPlaying(false);return;}if(reduced){scrub(current.current>=2?1:current.current<1?1:2);return;}if(current.current>=2){set(1);setTarget(2);}else if(Math.abs(current.current-target)<1e-9)setTarget(current.current<1?1:2);setPlaying(true);};
 return {position,playing,reduced,go,scrub,play,pause:()=>setPlaying(false)};
}
