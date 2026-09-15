"use client";
import { useEffect, useRef, useState } from "react";
import { accountFileBlob } from "@/lib/account-files";
import type { SubjectFile } from "@/lib/subject-files";
import styles from "./storage-view.module.css";

export default function StoragePreview({ file, close }: { file: SubjectFile; close: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const pdf = useRef<HTMLObjectElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    let objectUrl = "", cancelled = false;
    void accountFileBlob(file).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(new Blob([blob], { type: file.kind === "pdf" ? "application/pdf" : "image/png" }));
      if (image.current) image.current.src = objectUrl;
      if (pdf.current) pdf.current.data = objectUrl;
      if (link.current) link.current.href = objectUrl;
      setLoading(false);
    }).catch(() => { if (!cancelled) { setError("โหลดไฟล์ไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่เมื่อออนไลน์"); setLoading(false); } });
    const element = dialog.current;
    element?.showModal();
    return () => { cancelled = true; element?.close(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file]);
  return <dialog ref={dialog} className={styles.preview} aria-label={`ดูไฟล์ ${file.name}`} onCancel={close}>
    <header><div><strong>{file.name}.{file.kind}</strong><small>{file.kind.toUpperCase()} · ตัวอย่างไฟล์</small></div><button autoFocus className="secondary-button" onClick={close}>ปิด ×</button></header>
    {loading && <p role="status">กำลังโหลดไฟล์…</p>}{error && <p role="alert">{error}</p>}
    <><div className={styles.previewBody}>{file.kind === "pdf" ? <object ref={pdf} type="application/pdf" aria-label={file.name}><p>เบราว์เซอร์นี้ไม่รองรับการแสดง PDF ในหน้าเว็บ ใช้ปุ่มเปิดแท็บใหม่ด้านล่างได้</p></object> : <img ref={image} alt={file.name} /> /* eslint-disable-line @next/next/no-img-element */}</div><footer><span>หากไฟล์ไม่แสดง ลองเปิดในแท็บใหม่</span><a ref={link} target="_blank" rel="noopener noreferrer">เปิดไฟล์ในแท็บใหม่ ↗</a></footer></>
  </dialog>;
}
