"use client";
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {BRAND_LOGO} from '../../lib/site';
import IntentLink from './IntentLink';
import s from './UnifiedNav.module.css';

const links=[['/','首页'],['/#projects','项目'],['/#activities','活动'],['/learn/neural-networks','学习'],['/play/rocket','实验'],['/ai','SNN AI'],['/#join','加入'],['/join/interview','入社面试']];
const labs=[['/play/rocket','回收挑战'],['/play/rocket/explain','怎样推理'],['/play/rocket/train','怎样学习']];
export function Nav(){
 const path=(usePathname()||'/').replace(/\/$/,'')||'/';
 const lab=path.startsWith('/play/rocket');
 const [open,setOpen]=useState(false);const shell=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const link=document.getElementById('snn-font-fallback');if(!(link instanceof HTMLLinkElement))return;const enable=()=>{link.media='all';};if(link.sheet)enable();else link.addEventListener('load',enable,{once:true});return()=>link.removeEventListener('load',enable);},[]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!shell.current?.contains(e.target))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);toggle.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[open]);
 return <header ref={shell} className={s.shell} data-site-shell data-lab={lab}>
  <div className={s.bar}>
   <IntentLink className={s.brand} href="/" aria-label="SNN 首页"><img src={BRAND_LOGO.src} alt="" width="32" height="32"/><span><b>SNN</b><small>SMART NEURAL NETWORK</small></span></IntentLink>
   <button ref={toggle} className={s.toggle} aria-expanded={open} aria-controls="site-navigation" onClick={()=>setOpen(!open)}>{open?'[ 关闭 ]':'[ 导航 ]'}</button>
   <nav id="site-navigation" aria-label="主导航" className={`${s.links} ${open?s.open:''}`}>{links.map(([href,label])=>{
    const active=href==='/'?path==='/':href==='/learn/neural-networks'?path.startsWith('/learn/'):href==='/play/rocket'?lab:!href.includes('#')&&path===href;
    return <IntentLink href={href} key={href} aria-current={active?'page':undefined} onClick={()=>setOpen(false)}>{label}</IntentLink>;
   })}</nav>
  </div>
  {lab&&<div className={s.labBar}><span>学习实验室 / 火箭回收</span><nav aria-label="火箭实验导航">{labs.map(([href,label])=><IntentLink key={href} href={href} aria-current={path===href?'page':undefined}>{label}</IntentLink>)}</nav></div>}
 </header>;
}
