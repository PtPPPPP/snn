"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {usePathname} from 'next/navigation';
import {BRAND_LOGO} from '../../lib/site';
import {markLabVisited} from '../../lib/ai-handoff';
import IntentLink from './IntentLink';
import s from './UnifiedNav.module.css';

const links=[['/','首页'],['/#projects','项目'],['/#activities','活动'],['/learn/neural-networks','学习'],['/play/rocket','实验'],['/ai','SNN AI'],['/#join','加入'],['/join/interview','入社面试']];
const labs=[['/learn/neural-networks','01 神经网络基础'],['/play/rocket','02 回收挑战'],['/play/rocket/explain','03 怎样推理'],['/play/rocket/train','04 怎样学习']];
function subscribeTheme(onStoreChange:()=>void){
 window.addEventListener('snn-theme-change',onStoreChange);
 window.addEventListener('storage',onStoreChange);
 return()=>{
  window.removeEventListener('snn-theme-change',onStoreChange);
  window.removeEventListener('storage',onStoreChange);
 };
}
function getThemeSnapshot(){
 try{
  const saved=localStorage.getItem('snn-theme');
  if(saved==='dark'||saved==='light')return saved==='dark';
 }catch{/* ignore */}
 return document.documentElement.dataset.theme==='dark';
}
export function Nav(){
 const path=(usePathname()||'/').replace(/\/$/,'')||'/';
 const lab=path.startsWith('/play/rocket');
 const shell=useRef<HTMLElement>(null),menu=useRef<HTMLDetailsElement>(null);
 const dark=useSyncExternalStore(subscribeTheme,getThemeSnapshot,()=>false);
 const [visitedLabs,setVisitedLabs]=useState<string[]>([]);
 const closeMenu=()=>{if(menu.current)menu.current.open=false;};
 useEffect(()=>{
  document.documentElement.dataset.theme=dark?'dark':'light';
 },[dark]);
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync visited labs with localStorage on route change
  setVisitedLabs(markLabVisited(path));
 },[path]);
 const toggleTheme=()=>{
  const next=dark?'light':'dark';
  document.documentElement.dataset.theme=next;
  try{localStorage.setItem('snn-theme',next);}catch{/* ignore */}
  window.dispatchEvent(new Event('snn-theme-change'));
 };
 useEffect(()=>{const link=document.getElementById('snn-font-fallback');if(!(link instanceof HTMLLinkElement))return;const enable=()=>{link.media='all';};if(link.sheet)enable();else link.addEventListener('load',enable,{once:true});return()=>link.removeEventListener('load',enable);},[]);
 useEffect(()=>{
  const outside=(e:PointerEvent)=>{if(menu.current?.open && e.target instanceof Node && !shell.current?.contains(e.target))closeMenu();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape' && menu.current?.open){closeMenu();menu.current.querySelector('summary')?.focus();}};
  const restored=(e:PageTransitionEvent)=>{if(e.persisted)closeMenu();};
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  window.addEventListener('pageshow',restored);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('pageshow',restored);};
 },[]);
 return <header ref={shell} className={s.shell} data-site-shell data-lab={lab}>
  <div className={s.bar}>
   <IntentLink className={s.brand} href="/" aria-label="SNN 首页"><img src={BRAND_LOGO.src} alt="" width="32" height="32"/><span><b>SNN</b><small>SMART NEURAL NETWORK</small></span></IntentLink>
   <details className={s.mobileMenu} ref={menu} suppressHydrationWarning>
    <summary className={s.toggle} aria-controls="site-navigation"><span className={s.whenClosed}>[ 导航 ]</span><span className={s.whenOpen}>[ 关闭 ]</span></summary>
   </details>
   <nav id="site-navigation" aria-label="主导航" className={s.links}>{links.map(([href,label])=>{
    const active=href==='/'?path==='/':href==='/learn/neural-networks'?path.startsWith('/learn/'):href==='/play/rocket'?lab:!href.includes('#')&&path===href;
    return <IntentLink href={href} key={href} aria-current={active?'page':undefined} onClick={closeMenu}>{label}</IntentLink>;
   })}</nav>
   <button type="button" className={s.themeToggle} onClick={toggleTheme} aria-pressed={dark} aria-label={dark?'切换为浅色模式':'切换为黑夜模式'} title={dark?'切换为浅色模式':'切换为黑夜模式'}>
    {dark ? (
     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77"/></svg>
    ) : (
     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    )}
   </button>
  </div>
  {lab&&<div className={s.labBar}><span>学习实验室 / 火箭回收</span><nav aria-label="火箭实验导航">{labs.map(([href,label])=><IntentLink key={href} href={href} data-visited={visitedLabs.includes(href)||undefined} aria-current={path===href?'page':undefined}>{label}</IntentLink>)}</nav></div>}
 </header>;
}
