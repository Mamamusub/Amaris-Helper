"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { dialogKeyboard } from "./dialog-keyboard";
import styles from "./exam-view.module.css";

export default function ExamDialog({ title, children, close, busy = false }: { title: string; children: ReactNode; close: () => void; busy?: boolean }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="workspace-overlay" onKeyDown={event => dialogKeyboard(event, () => { if (!busy) close(); })}>
    <section ref={panel} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="exam-dialog-title">
      <div className="panel-heading"><h3 id="exam-dialog-title">{title}</h3><button type="button" className="secondary-button" disabled={busy} aria-label="Close dialog" onClick={close}>×</button></div>
      {children}
    </section>
  </div>;
}
