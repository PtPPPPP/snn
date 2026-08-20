"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "#about", label: "关于我们", id: "about" },
  { href: "#projects", label: "项目", id: "projects" },
  { href: "#activities", label: "活动", id: "activities" },
  { href: "#join", label: "加入", id: "join" },
];

export function Nav() {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const ids = ["about", "activities", "projects", "join"];
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="SNN 首页">
        <img
          className="brand-logo"
          src="/assets/snn-logo-fixed.png"
          alt="SNN 社团 Logo"
          width={1254}
          height={1254}
        />
        <span className="brand-name">SNN</span>
      </a>

      <nav className="main-nav" aria-label="主导航">
        {NAV_LINKS.map((link) => (
          <a
            key={link.id}
            href={link.href}
            className={active === link.id ? "active" : undefined}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <Link className="nav-open-pill" href="/ai/" aria-label="打开 SNN AI"><span aria-hidden="true">•••</span> Open SNN AI</Link>
    </header>
  );
}
