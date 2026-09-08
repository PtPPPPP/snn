"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {BRAND_LOGO} from '../../lib/site';
import s from './Nav.module.css';
const links=[['/','首页'],['/#projects','项目'],['/#activities','活动'],['/#join','加入'],['/ai','SNN AI'],['/play/rocket','火箭实验']];
const labs=[['/play/rocket','01','回收挑战'],['/play/rocket/explain','02','怎样推理'],['/play/rocket/train','03','怎样学习']];
export function Nav(){
 const path=(usePathname()||'/').replace(/\/$/,'')||'/';const lab=path.startsWith('/play/rocket');
 const [open,setOpen]=useState(false);const shell=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!shell.current?.contains(e.target))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);toggle.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[open]);
 return <header ref={shell} className={s.shell} data-site-shell data-lab={lab}>
  <div className={s.bar}><Link className={s.brand} href="/" aria-label="SNN 首页"><img src={BRAND_LOGO.src} alt="SNN 社团 Logo" width="32" height="32"/><span>SNN<small>SMART NEURAL NETWORK</small></span></Link><button ref={toggle} className={s.toggle} aria-expanded={open} aria-controls="site-navigation" onClick={()=>setOpen(!open)}>导航</button><nav id="site-navigation" aria-label="主导航" className={`${s.links} ${open?s.open:''}`}>{links.map(([href,label])=>{const active=href==='/play/rocket'?lab:path===href;return <Link href={href} key={href} aria-current={active?'page':undefined} onClick={()=>setOpen(false)}>{label}</Link>;})}</nav></div>
  {lab&&<div className={s.labBar}><span className={s.labTitle}>学习实验室 <i>/</i> 火箭回收</span><nav aria-label="实验导航">{labs.map(([href,n,label])=><Link key={href} href={href} aria-current={path===href?'page':undefined}><small>{n}</small>{label}</Link>)}</nav></div>}
 </header>;
}
