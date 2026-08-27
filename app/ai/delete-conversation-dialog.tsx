"use client";

import { useCallback, useEffect, useRef } from "react";
import styles from "./ai-chat.module.css";

export default function DeleteConversationDialog({ onCancel, onConfirm, returnFocusId }: { onCancel: () => void; onConfirm: () => void; returnFocusId: string | null }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    const target = document.getElementById(returnFocusId ?? "");
    target?.focus();
    onCancel();
    setTimeout(() => target?.focus(), 0);
  }, [onCancel, returnFocusId]);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], textarea, input, select')];
      if (focusable.length === 0) return;
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);
  return <div className={styles.modalBackdrop} onClick={close} role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
    <div className={styles.modal} ref={dialogRef} onClick={(event) => event.stopPropagation()}>
      <p className={styles.modalTitle} id="delete-dialog-title">确定删除这个对话吗？</p>
      <p className={styles.modalDesc}>此操作无法恢复。</p>
      <div className={styles.modalActions}><button className={styles.modalCancel} ref={cancelRef} type="button" onClick={close}>取消</button><button className={styles.modalConfirm} type="button" onClick={onConfirm}>删除</button></div>
    </div>
  </div>;
}
