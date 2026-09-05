"use client";

import { useEffect, useEffectEvent, useRef } from "react";

/** Mobile drawers own keyboard focus while their desktop columns remain navigable. */
export function useDrawerFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const drawer = ref.current;
    if (!open || !drawer) return;
    const mobile = window.matchMedia("(max-width: 900px)");
    let restoreFocus: HTMLElement | null = null;
    const buttons = () => [...drawer.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], textarea:not(:disabled), [tabindex='0']")]
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
    const sync = () => {
      if (mobile.matches) {
        restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        drawer.setAttribute("role", "dialog");
        drawer.setAttribute("aria-modal", "true");
        buttons()[0]?.focus();
      } else {
        drawer.removeAttribute("role");
        drawer.removeAttribute("aria-modal");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // The file editor handles Escape itself; delete confirmation owns its own focus.
      if (!mobile.matches || event.defaultPrevented || !drawer.contains(event.target as Node)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        const targets = buttons();
        const first = targets[0];
        const last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    sync();
    mobile.addEventListener("change", sync);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      mobile.removeEventListener("change", sync);
      document.removeEventListener("keydown", onKeyDown);
      drawer.removeAttribute("role");
      drawer.removeAttribute("aria-modal");
      if (mobile.matches && restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, [open]);

  return ref;
}
