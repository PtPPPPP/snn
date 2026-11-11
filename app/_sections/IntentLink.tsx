"use client";

import Link, {useLinkStatus} from 'next/link';
import {useEffect, useState, type ComponentPropsWithoutRef} from 'react';
import {publicDocumentRoutes} from '../../lib/public-documents.mjs';
import s from './IntentLink.module.css';

type IntentLinkProps = ComponentPropsWithoutRef<'a'> & {href: string};

function PendingNavigation(){
 const {pending}=useLinkStatus();
 return pending?<span className={s.pending} role="status">[ 正在打开… ]</span>:null;
}

export default function IntentLink({href, children, ...props}: IntentLinkProps) {
  if (publicDocumentRoutes.includes(href.split('#', 1)[0])) {
    return <a {...props} href={href} data-snn-document="">{children}</a>;
  }
  return <Link {...props} href={href} prefetch={false}>{children}<PendingNavigation/></Link>;
}

// Native document navigation also works before hydration. Keep the existing
// feedback on slow connections and clear it when Back restores this document.
export function DocumentNavigationStatus() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let timer = 0;
    const clear = () => { window.clearTimeout(timer); setPending(false); };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      clear();
      if (!link.hasAttribute('data-snn-document') || (link.pathname === location.pathname && link.search === location.search)) return;
      timer = window.setTimeout(() => setPending(true), 180);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') clear(); };
    document.addEventListener('click', click);
    document.addEventListener('keydown', escape);
    window.addEventListener('pageshow', clear);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', click);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('pageshow', clear);
    };
  }, []);
  return pending ? <span className={s.pending} role="status">[ 正在打开… ]</span> : null;
}
