"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BRAND_LOGO } from "../../lib/site";

const NAV_LINKS = [
  { href: "#about", label: "关于我们", id: "about" },
  { href: "#projects", label: "项目", id: "projects" },
  { href: "#activities", label: "活动", id: "activities" },
  { href: "#join", label: "加入", id: "join" },
];

export function Nav() {
  const [active, setActive] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    const ids = NAV_LINKS.map((link) => link.id);
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
    <header className="site-header" ref={headerRef}>
      <a className="brand" href="#top" aria-label="SNN 首页">
        <img
          className="brand-logo"
          src={BRAND_LOGO.src}
          alt="SNN 社团 Logo"
          width={BRAND_LOGO.width}
          height={BRAND_LOGO.height}
        />
        <span className="brand-name">SNN</span>
      </a>

      <button className="nav-menu-toggle" type="button" ref={menuRef} aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(!menuOpen)}>导航</button>
      <nav className={`main-nav${menuOpen ? " main-nav-open" : ""}`} id="site-navigation" aria-label="主导航">
        {NAV_LINKS.map((link) => (
          <a
            key={link.id}
            href={link.href}
            className={active === link.id ? "active" : undefined}
            aria-current={active === link.id ? "location" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <Link className="nav-open-pill" href="/ai/" aria-label="进入 SNN AI">进入 SNN AI</Link>
    </header>
  );
}
