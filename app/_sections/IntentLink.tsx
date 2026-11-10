"use client";

import Link, {useLinkStatus} from 'next/link';
import {useRouter} from 'next/navigation';
import type {ComponentProps} from 'react';
import s from './IntentLink.module.css';

type IntentLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & {
 href: string;
};

/** Prepare only the destination the visitor is about to choose. */
function PendingNavigation(){
 const {pending}=useLinkStatus();
 return pending?<span className={s.pending} role="status">[ 正在打开… ]</span>:null;
}

export default function IntentLink({href,onMouseEnter,onFocus,onTouchStart,children,...props}:IntentLinkProps){
 const router=useRouter();
 const warm=()=>{
  // Interview pages can depend on the visitor's current identity. Same-page
  // anchors do not need a server request at all.
  if(href.includes('#')||href.startsWith('/join/interview')||href===window.location.pathname)return;
  router.prefetch(href);
 };
 return <Link {...props} href={href} prefetch={false}
  onMouseEnter={event=>{onMouseEnter?.(event);warm();}}
  onFocus={event=>{onFocus?.(event);warm();}}
  onTouchStart={event=>{onTouchStart?.(event);warm();}}>{children}<PendingNavigation/></Link>;
}
