"use client";
import { useEffect, useRef, useState } from "react";
import type { Subject } from "@/lib/types";
import { fileAsPdf, fileKind, listSubjectFiles, saveSubjectFiles, type SubjectFile } from "@/lib/subject-files";
import styles from "./storage-view.module.css";

const sizeLabel = (n: number) => n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
export default function StorageView({ subjects, scope }: { subjects: Subject[]; scope: string }) {
  const [files, setFiles] = useState<SubjectFile[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    listSubjectFiles(scope).then((next) => { if (!cancelled) { setFiles(next); setLoading(false); } }).catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scope, revision]);
  const folders = subjects.map((s) => ({ id: s.id, name: s.name, color: s.color }));
  for (const file of files) if (!folders.some((s) => s.id === file.subjectId)) folders.push({ id: file.subjectId, name: `${file.subjectName} (วิชาที่ถูกลบ)`, color: "#9ba58e" });
  const folder = folders.find((s) => s.id === folderId);
  const shown = files.filter((f) => f.subjectId === folderId && f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function importFiles(selected: File[]) {
    if (!folder || busy || !selected.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const additions: SubjectFile[] = [];
      for (const file of selected) {
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: ขนาดต้องไม่เกิน 25 MB ต่อไฟล์`);
        const kind = await fileKind(file);
        additions.push({ id: crypto.randomUUID(), scope, subjectId: folder.id, subjectName: folder.name, name: file.name.replace(/\.(pdf|png)$/i, "") || "Untitled", kind, size: file.size, createdAt: new Date().toISOString(), blob: file });
      }
      await saveSubjectFiles(additions);
      setFiles((current) => [...current, ...additions]); setNotice(`นำเข้าแล้ว ${additions.length} ไฟล์`);
    } catch (e) { setError(e instanceof Error ? e.message : "นำเข้าไฟล์ไม่สำเร็จ"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function rename(file: SubjectFile) {
    const cleaned = name.trim().replace(/\.(pdf|png)$/i, "").trim();
    if (!cleaned) { setError("กรุณาระบุชื่อไฟล์"); return; }
    setBusy(true); setError("");
    try { const next = { ...file, name: cleaned }; await saveSubjectFiles([next]); setFiles((all) => all.map((f) => f.id === file.id ? next : f)); setRenaming(null); setNotice("เปลี่ยนชื่อแล้ว"); }
    catch { setError("เปลี่ยนชื่อไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  }
  async function exportPdf(file: SubjectFile) {
    setBusy(true); setError(""); setNotice("");
    try {
      const blob = await fileAsPdf(file);
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `${file.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}.pdf`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(`ส่งออก ${file.name}.pdf แล้ว`);
    } catch { setError("ส่งออกไม่สำเร็จ ไฟล์ภาพอาจเสียหาย กรุณาลองนำเข้าใหม่"); } finally { setBusy(false); }
  }
  function openFolder(id: string | null) { setFolderId(id); setQuery(""); setRenaming(null); setNotice(""); }
  return <div className={`content ${styles.page}`}><div className={styles.heading}><div><span className="section-kicker">A PLACE FOR YOUR KNOWLEDGE</span><h2>Study storage<span>.</span></h2><p>เอกสารและภาพประกอบ จัดไว้เป็นที่ แยกตามวิชาของคุณ</p></div><span className={styles.local}>◉ เก็บในเครื่องนี้</span></div>
    <div className={styles.toolbar}><div className={styles.breadcrumb}><button disabled={busy} onClick={() => openFolder(null)}>Storage</button>{folder && <><span>/</span><strong>{folder.name}</strong></>}</div><input aria-label={folder ? "ค้นหาไฟล์" : "ค้นหาวิชา"} placeholder={folder ? "ค้นหาไฟล์ในวิชานี้…" : "ค้นหาวิชา…"} value={query} onChange={(e) => setQuery(e.target.value)} />{folder && <button className="primary-button" disabled={busy || loading} onClick={() => input.current?.click()}>＋ Import files</button>}<input ref={input} type="file" hidden multiple accept=".pdf,.png,application/pdf,image/png" onChange={(e) => void importFiles(Array.from(e.target.files ?? []))} /></div>
    <p className={styles.note}>PDF / PNG · สูงสุด 25 MB ต่อไฟล์ · ไฟล์ยังไม่ซิงก์ข้ามเครื่อง การล้างข้อมูลเว็บไซต์จะลบไฟล์ที่เก็บไว้</p>
    {error && <p role="alert" className={styles.error}>{error} <button disabled={busy} onClick={() => { setError(""); setRevision((r) => r + 1); }}>ลองโหลดใหม่</button></p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">กำลังจัดการไฟล์…</p>}
    {loading ? <p role="status">กำลังโหลด Storage…</p> : !folder ? <><div className={styles.sectionTitle}><h3>โฟลเดอร์วิชา</h3><span>{folders.length} folders · {files.length} files</span></div><div className={styles.folders}>{folders.filter((s) => s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((s) => <button key={s.id} onClick={() => openFolder(s.id)}><span className={styles.folderIcon} style={{ color: s.color }}>▰</span><strong>{s.name}</strong><small>{files.filter((f) => f.subjectId === s.id).length} ไฟล์ <span>↗</span></small></button>)}</div>{!folders.length && <div className={styles.empty}><h3>เริ่มจากเพิ่มวิชาในหน้า Study</h3><p>วิชาที่สร้างไว้จะปรากฏเป็นโฟลเดอร์ที่นี่อัตโนมัติ</p></div>}{!!folders.length && !folders.some((s) => s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p className={styles.empty}>ไม่พบวิชาที่ค้นหา</p>}</> : <section className={styles.filePanel}><div className={styles.sectionTitle}><h3>ไฟล์ในวิชา</h3><span>{shown.length} files</span></div>{shown.map((file) => <div className={styles.file} key={file.id}><span className={file.kind === "pdf" ? styles.pdf : styles.png}>{file.kind.toUpperCase()}</span><div className={styles.fileInfo}>{renaming === file.id ? <form onSubmit={(e) => { e.preventDefault(); void rename(file); }}><input autoFocus aria-label="ชื่อไฟล์ใหม่" maxLength={180} value={name} onChange={(e) => setName(e.target.value)} /><button disabled={busy} type="submit">บันทึก</button><button type="button" disabled={busy} onClick={() => setRenaming(null)}>ยกเลิก</button></form> : <strong>{file.name}.{file.kind}</strong>}<small>{sizeLabel(file.size)} · {new Date(file.createdAt).toLocaleDateString("th-TH")}</small></div><div className={styles.actions}><button className="secondary-button" disabled={busy} onClick={() => { setRenaming(file.id); setName(file.name); }}>เปลี่ยนชื่อ</button><button className="secondary-button" disabled={busy} onClick={() => void exportPdf(file)}>↓ Export PDF</button></div></div>)}{!shown.length && <div className={styles.empty}><span>＋</span><h3>{query ? "ไม่พบไฟล์ที่ค้นหา" : "เก็บเอกสารแรกของวิชานี้"}</h3><p>กด Import files เพื่อเลือก PDF หรือ PNG ได้หลายไฟล์</p></div>}<p className={styles.note}>PDF ส่งออกเป็นไฟล์เดิมครบทุกหน้า · PNG แปลงเป็น PDF ขนาด A4 โดยรักษาสัดส่วนภาพ</p></section>}
  </div>;
}
