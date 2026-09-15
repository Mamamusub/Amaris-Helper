"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Subject } from "@/lib/types";
import { dayKey } from "@/lib/calendar";
import { EXAM_CHANGED, readExamData, materialTypes, type ExamMaterial, type ExamNote, type ExamTopic } from "@/lib/exam-storage";
import { calendarMonth, daysUntilExam, examRouteId, examUrgency, hubExams, readiness, readinessOverview, recentExams, safeMaterialUrl, saveHubExam, selectExams, shiftExamMonth, validateExam, type ExamFilter, type HubExam } from "@/lib/exam-hub";
import { accountFileBlob, fileRecords, uploadAccountFile, type AccountFile } from "@/lib/account-files";
import { getStoredFiles, saveStoredFile, type StoredFile } from "@/lib/exam-files";
import { getFiles } from "@/lib/standalone-exam-files";
import { fileKind, listSubjectFiles, type SubjectFile } from "@/lib/subject-files";
import { useAccountStorage, useCloud, useCloudSnapshot } from "./account-boundary";
import ExamDialog from "./exam-dialog";
import StoragePreview from "./storage-preview";
import styles from "./exam-view.module.css";

type Editor = { kind: "exam" | "topic" | "material" | "note"; exam?: HubExam; id?: string; values: Record<string, string> };
type LibraryFile = AccountFile & { area: "exam" | "study" | "exam-standalone"; subjectId: string; kind?: "pdf" | "png"; type?: string };
const dateLabel = (date: string) => Number.isFinite(Date.parse(date)) ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00+07:00`)) : "Date not set";
const countdown = (date: string, today: string) => { const days = daysUntilExam(date, today); return !Number.isFinite(days) ? "Date not set" : days < 0 ? "Completed" : days === 0 ? "Today" : `${days} days left`; };
const pathExam = () => { const path = typeof window === "undefined" ? "" : window.location?.pathname ?? ""; try { return path.startsWith("/exam/") ? decodeURIComponent(path.slice(6)) : ""; } catch { return ""; } };

export default function ExamView({ subjects, initialSubjectId = "", initialExamId = "" }: { subjects: Subject[]; initialSubjectId?: string; initialExamId?: string }) {
  const storage = useAccountStorage(), cloud = useCloud(), synced = useCloudSnapshot();
  const [data, setData] = useState(() => readExamData(storage));
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [selectedId, setSelectedId] = useState(() => pathExam() || initialExamId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ExamFilter>("Upcoming");
  const [subjectFilter, setSubjectFilter] = useState(initialSubjectId);
  const [materialFilter, setMaterialFilter] = useState("All");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<{ title: string; exam: HubExam; kind: "exam" | "topic" | "material" | "note"; id?: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<File | null>(null);
  const [localFiles, setLocalFiles] = useState<LibraryFile[]>([]);
  const [fileRevision, setFileRevision] = useState(0);
  const [preview, setPreview] = useState<SubjectFile | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const exams = hubExams(data, subjects), selected = exams.find(exam => examRouteId(exam) === selectedId);
  const shown = selectExams(exams, today, filter, query, subjectFilter);
  const upcoming = selectExams(exams, today, "Upcoming");
  const overview = readinessOverview(upcoming), recent = recentExams(exams);
  const library: LibraryFile[] = cloud ? [
    ...fileRecords<StoredFile>(cloud, "exam").map(file => ({ ...file, area: "exam" as const })),
    ...fileRecords<SubjectFile>(cloud, "study").map(file => ({ ...file, area: "study" as const })),
    ...fileRecords<StoredFile>(cloud, "exam-standalone").map(file => ({ ...file, area: "exam-standalone" as const })),
  ].map(file => ({ ...file, blob: localFiles.find(local => local.id === file.id && local.area === file.area)?.blob ?? new Blob() })) : localFiles;
  useEffect(() => {
    const refresh = () => { setData(readExamData(storage)); setToday(dayKey(new Date())); };
    const back = () => { setSelectedId(pathExam()); setEditor(null); setDeleting(null); };
    const timer = setInterval(() => setToday(dayKey(new Date())), 30000);
    window.addEventListener("storage", refresh); window.addEventListener(EXAM_CHANGED, refresh); window.addEventListener("focus", refresh); window.addEventListener("popstate", back);
    return () => { clearInterval(timer); window.removeEventListener("storage", refresh); window.removeEventListener(EXAM_CHANGED, refresh); window.removeEventListener("focus", refresh); window.removeEventListener("popstate", back); };
  }, [storage]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getStoredFiles(cloud?.key), listSubjectFiles(cloud?.key ?? "local"), getFiles(cloud?.key)]).then(([exam, study, old]) => {
      if (!cancelled) setLocalFiles([...exam.map(file => ({ ...file, area: "exam" as const })), ...study.map(file => ({ ...file, area: "study" as const })), ...old.map(file => ({ ...file, area: "exam-standalone" as const }))]);
    }).catch(() => { if (!cancelled) setError("อ่านไฟล์ในเครื่องไม่สำเร็จ กรุณาลองโหลดหน้าใหม่"); });
    return () => { cancelled = true; };
  }, [cloud, fileRevision]);
  function navigate(exam?: HubExam) {
    const id = exam ? examRouteId(exam) : "";
    setSelectedId(id); setMaterialFilter("All"); setError(""); setNotice("");
    window.history?.pushState(null, "", id ? `/exam/${encodeURIComponent(id)}` : "/exam");
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function commit(next: HubExam, expected?: HubExam) {
    try {
      const result = saveHubExam(storage, next, expected);
      setData(readExamData(storage)); window.dispatchEvent(new Event(EXAM_CHANGED));
      setError(""); setNotice(cloud ? "เข้าคิวซิงก์แล้ว · ดูสถานะด้านบน" : "บันทึกแล้วในเบราว์เซอร์นี้");
      return result;
    } catch (problem) { setError(problem instanceof Error ? problem.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่"); return null; }
  }
  function openEditor(kind: Editor["kind"], exam?: HubExam, item?: ExamTopic | ExamMaterial | ExamNote) {
    setError(""); setUpload(null);
    const values: Record<string, string> = kind === "exam" ? { subjectId: exam && subjects.some(subject => subject.id === exam.subjectId) ? exam.subjectId : !exam && subjects[0] ? subjects[0].id : "__custom__", subjectName: exam?.subjectName ?? "", title: exam?.calendarName || exam?.type || "", type: exam?.type ?? "Midterm", date: exam?.date ?? today, time: exam?.time ?? "", endTime: exam?.endTime ?? "", room: exam?.room ?? "", targetScore: exam?.targetScore ?? "", notes: exam?.notes ?? "", color: exam?.color ?? "#879f58" } : Object.fromEntries(Object.entries(item ?? {}).filter(([, value]) => typeof value === "string")) as Record<string, string>;
    if (kind === "material") { values.type ||= "Lecture"; values.source ||= "link"; values.file = item && "fileId" in item ? `${item.fileArea}:${item.fileId}` : ""; }
    setEditor({ kind, exam, id: item?.id, values });
  }
  function closeEditor() { if (!busy) { setEditor(null); setDeleting(null); setError(""); setUpload(null); } }
  async function saveEditor(event: FormEvent) {
    event.preventDefault(); if (!editor || busy) return;
    const values = Object.fromEntries(Object.entries(editor.values).map(([key, value]) => [key, value.trim()]));
    const id = editor.id ?? crypto.randomUUID(), now = new Date().toISOString();
    if (editor.kind === "exam") {
      const subject = subjects.find(subject => subject.id === values.subjectId), examId = editor.exam?.id ?? id;
      const next: HubExam = { ...editor.exam, id: examId, subjectId: subject?.id ?? (editor.exam?.subjectId.startsWith("exam-") ? editor.exam.subjectId : `exam-${examId}`), subjectName: subject?.name ?? values.subjectName, calendarName: values.title, type: values.type as HubExam["type"], date: values.date, time: values.time, endTime: values.endTime, room: values.room, targetScore: values.targetScore, notes: values.notes, color: values.color, topics: editor.exam?.topics ?? [], materials: editor.exam?.materials ?? [], formulaNotes: editor.exam?.formulaNotes ?? [] };
      const invalid = validateExam(next); if (invalid) { setError(invalid); return; }
      if (commit(next, editor.exam)) { closeEditor(); navigate(next); }
      return;
    }
    const exam = editor.exam!;
    if (editor.kind === "topic") {
      if (!values.title) { setError("กรอกชื่อหัวข้อ"); return; }
      const original = exam.topics.find(topic => topic.id === id);
      const topic: ExamTopic = { ...original, id, examId: exam.id, title: values.title, section: values.section ?? "", completed: original?.completed ?? false, order: original?.order ?? exam.topics.length, createdAt: original?.createdAt || now, updatedAt: now };
      if (commit({ ...exam, topics: original ? exam.topics.map(item => item.id === id ? topic : item) : [...exam.topics, topic] }, exam)) closeEditor();
    } else if (editor.kind === "note") {
      if (!values.content) { setError("กรอกข้อความโน้ต"); return; }
      const original = exam.formulaNotes.find(note => note.id === id);
      const note: ExamNote = { id, examId: exam.id, content: values.content, pinned: original?.pinned ?? false, createdAt: original?.createdAt || now, updatedAt: now };
      if (commit({ ...exam, formulaNotes: original ? exam.formulaNotes.map(item => item.id === id ? note : item) : [...exam.formulaNotes, note] }, exam)) closeEditor();
    } else {
      if (!values.name) { setError("กรอกชื่อเอกสาร"); return; }
      if (values.source === "link" && !safeMaterialUrl(values.url ?? "")) { setError("ใช้ลิงก์ http:// หรือ https:// ที่ถูกต้อง"); return; }
      if (values.source === "reference" && !values.url) { setError("กรอกชื่อ path หรือที่เก็บไฟล์"); return; }
      setBusy(true);
      try {
        let file = library.find(file => `${file.area}:${file.id}` === values.file);
        if (values.source === "file" && upload) {
          if (!upload.size || upload.size > 25 * 1024 * 1024) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 25 MB และไม่เป็นไฟล์ว่าง");
          await fileKind(upload);
          let added: StoredFile = { id: crypto.randomUUID(), scope: cloud?.key, subjectId: exam.subjectId, name: upload.name, type: upload.type, size: upload.size, createdAt: now, blob: upload };
          await saveStoredFile(added);
          if (cloud) { added = await uploadAccountFile(cloud, "exam", added); await saveStoredFile(added); }
          file = { ...added, area: "exam" }; setFileRevision(value => value + 1);
        }
        if (values.source === "file" && !file) throw new Error("เลือกไฟล์ที่มีอยู่หรืออัปโหลด PDF / PNG");
        const original = exam.materials.find(material => material.id === id);
        const material: ExamMaterial = { id, examId: exam.id, name: values.name, type: values.type as ExamMaterial["type"], source: values.source as ExamMaterial["source"], url: values.source === "file" ? "" : values.url, note: values.note ?? "", fileId: values.source === "file" ? file?.id : undefined, fileArea: values.source === "file" ? file?.area : undefined, createdAt: original?.createdAt || now, updatedAt: now };
        if (commit({ ...exam, materials: original ? exam.materials.map(item => item.id === id ? material : item) : [...exam.materials, material] }, exam)) { setEditor(null); setUpload(null); }
      } catch (problem) { setError(problem instanceof Error ? problem.message : "บันทึกเอกสารไม่สำเร็จ"); } finally { setBusy(false); }
    }
  }
  async function openMaterial(material: ExamMaterial) {
    const file = library.find(file => file.id === material.fileId && file.area === material.fileArea);
    if (!file) { setError("ไม่พบไฟล์แนบ · ตรวจบัญชีและสถานะซิงก์ หรือเลือกไฟล์ใหม่ผ่าน Edit"); return; }
    const kind = file.kind ?? (file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : file.type === "image/png" || /\.png$/i.test(file.name) ? "png" : null);
    if (kind) { setPreview({ ...file, name: file.name.replace(/\.(pdf|png)$/i, ""), kind, scope: cloud?.key ?? "local", subjectName: selected?.subjectName ?? "" }); return; }
    try { const url = URL.createObjectURL(await accountFileBlob(file)), link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch { setError("โหลดไฟล์ไม่ได้ กรุณาลองใหม่เมื่อออนไลน์"); }
  }
  function removeConfirmed() {
    if (!deleting) return;
    const { exam, kind, id } = deleting;
    const next = kind === "exam" ? { ...exam, deletedAt: new Date().toISOString() } : kind === "topic" ? { ...exam, topics: exam.topics.filter(item => item.id !== id) } : kind === "material" ? { ...exam, materials: exam.materials.filter(item => item.id !== id) } : { ...exam, formulaNotes: exam.formulaNotes.filter(item => item.id !== id) };
    if (commit(next, exam)) { closeEditor(); if (kind === "exam") navigate(); }
  }
  function moveTopic(exam: HubExam, id: string, direction: number) {
    const topics = [...exam.topics].sort((a, b) => a.order - b.order), index = topics.findIndex(topic => topic.id === id), target = index + direction;
    if (target < 0 || target >= topics.length) return;
    [topics[index], topics[target]] = [topics[target], topics[index]];
    commit({ ...exam, topics: topics.map((topic, order) => ({ ...topic, order, updatedAt: new Date().toISOString() })) }, exam);
  }
  function examCard(exam: HubExam) {
    const progress = readiness(exam.topics), urgency = examUrgency(daysUntilExam(exam.date, today));
    return <article className={`panel ${styles.examCard}`} key={examRouteId(exam)} style={{ borderTopColor: /^#[\da-f]{6}$/i.test(exam.color ?? "") ? exam.color : "#879f58" }}>
      <div className={styles.row}><span className="eyebrow">{exam.type}</span><span className={`${styles.badge} ${styles[urgency]}`}>{exam.archivedAt ? "Archived" : countdown(exam.date, today)}</span></div>
      <h3>{exam.subjectName}</h3><p className={styles.examTitle}>{exam.calendarName || exam.type}</p><p className={styles.meta}>{dateLabel(exam.date)}{exam.time && ` · ${exam.time}${exam.endTime ? `–${exam.endTime}` : ""}`}{exam.room && <><br />{exam.room}</>}</p>
      <div className={styles.row}><strong>{progress.percent}% ready</strong><span>{progress.done} / {progress.total} topics</span></div><progress max={100} value={progress.percent} aria-label={`${exam.calendarName || exam.type} readiness`} /><button className="secondary-button" onClick={() => navigate(exam)}>Open details ↗</button>
    </article>;
  }
  const field = (name: string, label: string, type = "text", required = false) => <label>{label}<input type={type} required={required} maxLength={200} value={editor?.values[name] ?? ""} onChange={event => setEditor(current => current && ({ ...current, values: { ...current.values, [name]: event.target.value } }))} {...(name === "targetScore" ? { min: 0, max: 100, step: "any" } : {})} /></label>;
  const area = (name: string, label: string, required = false) => <label className={styles.full}>{label}<textarea required={required} rows={4} maxLength={10000} value={editor?.values[name] ?? ""} onChange={event => setEditor(current => current && ({ ...current, values: { ...current.values, [name]: event.target.value } }))} /></label>;
  return <div className={`content ${styles.page}`}>
    <header className={styles.heading}><div><span className="section-kicker">STUDY WORKSPACE</span><h2 ref={titleRef} tabIndex={-1}>{selected ? selected.subjectName : "Exam"}</h2><p>{selected ? selected.calendarName || selected.type : "Plan, track, and prepare for upcoming exams."}</p></div><div className={styles.actions}>{selectedId && <button className="secondary-button" onClick={() => navigate()}>← All exams</button>}<button className="primary-button" disabled={busy} onClick={() => openEditor("exam", selected)}>{selected ? "Edit Exam" : "+ Add Exam"}</button></div></header>
    {error && !editor && !deleting && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {selectedId && !selected ? <section className="panel"><h3>{synced?.status === "กำลังโหลด" ? "Loading exam…" : "Exam not found"}</h3><p>ตรวจบัญชีที่เข้าสู่ระบบ หรือกลับไปเลือกข้อสอบจากรายการ</p><button className="secondary-button" onClick={() => navigate()}>Back to exams</button></section> : selected ? <>
      <section className={`panel ${styles.detailHeader}`}><div><span className={`${styles.badge} ${styles[examUrgency(daysUntilExam(selected.date, today))]}`}>{selected.archivedAt ? "Archived" : countdown(selected.date, today)}</span><h3>{dateLabel(selected.date)}</h3><p>{selected.time && `${selected.time}${selected.endTime ? `–${selected.endTime}` : ""} · `}{selected.room || "Location not set"}</p><p>Target score: {selected.targetScore ? `${selected.targetScore}%` : "Not set"}</p>{selected.notes && <p className={styles.plain}>{selected.notes}</p>}</div><div className={styles.readiness}><strong>{readiness(selected.topics).percent}%</strong><span>{readiness(selected.topics).done} / {selected.topics.length} completed</span><progress max={100} value={readiness(selected.topics).percent} aria-label="Exam readiness" /></div></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ONE TOPIC AT A TIME</span><h3>Study Checklist</h3></div><button className="primary-button" onClick={() => openEditor("topic", selected)}>+ Add topic</button></div>{!selected.topics.length && <p className={styles.empty}>Break this exam into topics you need to study.</p>}
        {[...selected.topics].sort((a, b) => a.order - b.order).map((topic, index, topics) => <div className={styles.topic} key={topic.id}><label><input type="checkbox" checked={topic.completed} onChange={() => commit({ ...selected, topics: selected.topics.map(item => item.id === topic.id ? { ...item, completed: !item.completed, completedAt: item.completed ? undefined : new Date().toISOString(), updatedAt: new Date().toISOString() } : item) }, selected)} /><span className={topic.completed ? styles.done : ""}>{topic.title}{topic.section && <small>{topic.section}</small>}</span></label><div className={styles.actions}><button className="secondary-button" aria-label={`Move ${topic.title} up`} disabled={index === 0} onClick={() => moveTopic(selected, topic.id, -1)}>↑</button><button className="secondary-button" aria-label={`Move ${topic.title} down`} disabled={index === topics.length - 1} onClick={() => moveTopic(selected, topic.id, 1)}>↓</button><button className="secondary-button" onClick={() => openEditor("topic", selected, topic)}>Edit</button><button className="text-button" aria-label={`Delete topic ${topic.title}`} onClick={() => setDeleting({ title: topic.title, exam: selected, kind: "topic", id: topic.id })}>Delete</button></div></div>)}
      </section>
      <div className={styles.detailGrid}>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">YOUR REFERENCES</span><h3>Study Materials</h3></div><button className="primary-button" onClick={() => openEditor("material", selected)}>+ Add material</button></div><label className={styles.filter}>Type<select value={materialFilter} onChange={event => setMaterialFilter(event.target.value)}>{["All", ...materialTypes].map(type => <option key={type}>{type}</option>)}</select></label>
          {!selected.materials.length && <p className={styles.empty}>Add lecture files, assignments, or past exams here.</p>}{!!selected.materials.length && !selected.materials.some(item => materialFilter === "All" || item.type === materialFilter) && <p className={styles.empty}>No materials of this type.</p>}
          {selected.materials.filter(item => materialFilter === "All" || item.type === materialFilter).map(material => <article className={styles.material} key={material.id}><span className={styles.badge}>{material.type}</span><h4>{material.name}</h4>{material.note && <p className={styles.plain}>{material.note}</p>}{material.source === "reference" && <p className={styles.reference}>{material.url}<small>Local reference · เปิดไฟล์จากเครื่องตาม path นี้</small></p>}<div className={styles.actions}>{material.source === "link" && safeMaterialUrl(material.url) && <a className="secondary-button" target="_blank" rel="noopener noreferrer" href={safeMaterialUrl(material.url)!}>Open link ↗</a>}{material.source === "file" && <button className="secondary-button" onClick={() => void openMaterial(material)}>Open file ↗</button>}<button className="secondary-button" onClick={() => openEditor("material", selected, material)}>Edit</button><button className="text-button" onClick={() => setDeleting({ title: material.name, exam: selected, kind: "material", id: material.id })}>Delete</button></div></article>)}
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">KEEP THE IMPORTANT BITS</span><h3>Formula Notes</h3></div><button className="primary-button" onClick={() => openEditor("note", selected)}>+ Add note</button></div>{!selected.formulaNotes.length && <p className={styles.empty}>Keep short notes and formulas here.</p>}{[...selected.formulaNotes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)).map(note => <article key={note.id} className={`${styles.note} ${note.pinned ? styles.pinned : ""}`}><p className={styles.plain}>{note.content}</p><div className={styles.actions}><button className="secondary-button" aria-pressed={note.pinned} onClick={() => commit({ ...selected, formulaNotes: selected.formulaNotes.map(item => item.id === note.id ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() } : item) }, selected)}>{note.pinned ? "★ Pinned" : "☆ Pin"}</button><button className="secondary-button" onClick={() => openEditor("note", selected, note)}>Edit</button><button className="text-button" onClick={() => setDeleting({ title: "this note", exam: selected, kind: "note", id: note.id })}>Delete</button></div></article>)}</section>
      </div><div className={styles.actions}><button className="secondary-button" onClick={() => commit({ ...selected, archivedAt: selected.archivedAt ? undefined : new Date().toISOString() }, selected)}>{selected.archivedAt ? "Restore from archive" : "Archive exam"}</button><button className="text-button" onClick={() => setDeleting({ title: selected.calendarName || selected.type, exam: selected, kind: "exam" })}>Delete exam</button></div>
    </> : <>
      <section className={styles.toolbar} aria-label="Filter exams"><label>Search<input type="search" value={query} placeholder="Subject or exam name…" onChange={event => setQuery(event.target.value)} /></label><label>Show<select value={filter} onChange={event => setFilter(event.target.value as ExamFilter)}>{["Upcoming", "Completed", "All", "Archived"].map(value => <option key={value}>{value}</option>)}</select></label><label>Subject<select value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}><option value="">All subjects</option>{[...new Map([...subjects.map(subject => [subject.id, subject.name] as const), ...exams.map(exam => [exam.subjectId, exam.subjectName] as const)])].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></section>
      <section aria-labelledby="exam-list-heading"><div className="panel-heading"><h3 id="exam-list-heading">{filter === "All" ? "All Exams" : `${filter} Exams`}</h3><span className={styles.meta}>{shown.length} exams</span></div>{!shown.length ? <div className={`panel ${styles.empty}`}><h3>{!exams.length ? "No exams yet. Add your first exam to start planning." : "No exams match these filters."}</h3><button className="secondary-button" onClick={() => !exams.length ? openEditor("exam") : (setQuery(""), setSubjectFilter(""), setFilter("All"))}>{!exams.length ? "+ Add Exam" : "Show all exams"}</button></div> : <div className={styles.cards}>{shown.map(examCard)}</div>}</section>
      <div className={styles.dashboardGrid}><section className="panel"><div className="panel-heading"><div><span className="eyebrow">EXAM CALENDAR</span><h3>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}</h3></div><div className={styles.actions}><button className="secondary-button" aria-label="Previous month" onClick={() => setMonth(shiftExamMonth(month, -1))}>←</button><button className="secondary-button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(today); }}>Today</button><button className="secondary-button" aria-label="Next month" onClick={() => setMonth(shiftExamMonth(month, 1))}>→</button></div></div><div className={styles.calendar}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span className={styles.weekday} key={day}>{day}</span>)}{calendarMonth(month).map((day, index) => { const count = exams.filter(exam => !exam.archivedAt && exam.date === day).length; return day ? <button key={day} className={styles.calendarDay} aria-pressed={selectedDay === day} aria-current={day === today ? "date" : undefined} aria-label={`${dateLabel(day)}, ${count} exams`} onClick={() => setSelectedDay(day)}>{Number(day.slice(-2))}{count > 0 && <small>{count} <span aria-hidden="true">●</span></small>}</button> : <span key={index} />; })}</div><h4>{dateLabel(selectedDay)}</h4>{!exams.some(exam => !exam.archivedAt && exam.date === selectedDay) && <p className={styles.meta}>No exams on this day.</p>}{exams.filter(exam => !exam.archivedAt && exam.date === selectedDay).sort((a, b) => a.time.localeCompare(b.time)).map(exam => <button className={styles.recent} key={examRouteId(exam)} onClick={() => navigate(exam)}><span>{exam.subjectName} · {exam.calendarName || exam.type}</span><small>{exam.time || "Time not set"} ↗</small></button>)}</section>
        <section className="panel"><span className="eyebrow">UPCOMING EXAM PREPARATION</span><h3>Study Readiness Overview</h3><div className={styles.readiness}><strong>{overview.percent}%</strong><span>Overall readiness · {overview.done} / {overview.total} topics</span></div><progress max={100} value={overview.percent} aria-label="Overall readiness" />{!overview.groups.length && <p className={styles.empty}>Add an upcoming exam to start tracking readiness.</p>}{overview.groups.map(group => <div className={styles.subjectProgress} key={group.id}><div className={styles.row}><span>{group.name}</span><strong>{group.percent}%</strong></div><progress max={100} value={group.percent} aria-label={`${group.name} readiness`} /></div>)}<p className={styles.meta}>Calculated from completed checklist topics. Exams without topics show 0%.</p></section>
      </div><section className="panel"><span className="eyebrow">YOUR LATEST CHANGES</span><h3>Recently Updated</h3>{!recent.length && <p className={styles.empty}>Your recent exam and checklist changes will appear here.</p>}{recent.map(exam => <button key={examRouteId(exam)} className={styles.recent} onClick={() => navigate(exam)}><span>{exam.subjectName} · {exam.calendarName || exam.type}</span><small>{new Date(exam.updatedAt!).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hourCycle: "h23" })} ↗</small></button>)}</section>
    </>}
    {editor && <ExamDialog title={`${editor.exam && editor.kind === "exam" || editor.id ? "Edit" : "Add"} ${editor.kind === "exam" ? "Exam" : editor.kind}`} close={closeEditor} busy={busy}><form onSubmit={event => void saveEditor(event)}><fieldset disabled={busy} className={styles.form}>{error && <p className={`${styles.error} ${styles.full}`} role="alert">{error}</p>}
      {editor.kind === "exam" && <><label className={styles.full}>Subject<select value={editor.values.subjectId} onChange={event => setEditor({ ...editor, values: { ...editor.values, subjectId: event.target.value } })}>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}<option value="__custom__">Other / Enter subject name</option></select></label>{editor.values.subjectId === "__custom__" && field("subjectName", "Subject name", "text", true)}{field("title", "Exam title", "text", true)}<label>Type<select value={editor.values.type} onChange={event => setEditor({ ...editor, values: { ...editor.values, type: event.target.value } })}>{["Midterm", "Final", "Quiz"].map(type => <option key={type}>{type}</option>)}</select></label>{field("date", "Exam date", "date", true)}{field("time", "Start time", "time")}{field("endTime", "End time", "time")}{field("room", "Location")}{field("targetScore", "Target score (%)", "number")}{field("color", "Subject identifier color", "color")}{area("notes", "Exam notes")}</>}
      {editor.kind === "topic" && <>{field("title", "Topic title", "text", true)}{field("section", "Section / Chapter (optional)")}</>}
      {editor.kind === "note" && area("content", "Note / formula", true)}
      {editor.kind === "material" && <>{field("name", "Material name", "text", true)}<label>Type<select value={editor.values.type} onChange={event => setEditor({ ...editor, values: { ...editor.values, type: event.target.value } })}>{materialTypes.map(type => <option key={type}>{type}</option>)}</select></label><label className={styles.full}>Source<select value={editor.values.source} onChange={event => { setUpload(null); setEditor({ ...editor, values: { ...editor.values, source: event.target.value } }); }}><option value="link">Web link</option><option value="file">Upload / existing file</option><option value="reference">Local path / reference</option></select></label>{editor.values.source === "file" ? <><label className={styles.full}>Existing file<select value={editor.values.file ?? ""} onChange={event => { setUpload(null); setEditor({ ...editor, values: { ...editor.values, file: event.target.value } }); }}><option value="">Choose a file</option>{library.map(file => <option key={`${file.area}:${file.id}`} value={`${file.area}:${file.id}`}>{file.name} · {file.area === "study" ? "Study Storage" : "Exam"}</option>)}</select></label><label className={styles.full}>Or upload PDF / PNG (up to 25 MB)<input type="file" accept=".pdf,.png,application/pdf,image/png" onChange={event => setUpload(event.target.files?.[0] ?? null)} /></label><p className={`${styles.meta} ${styles.full}`}>{cloud ? "Uploads use your private account storage." : "Files persist in this browser. Sign in and import local files to sync devices."}</p></> : field("url", editor.values.source === "link" ? "URL" : "Local file path / reference", editor.values.source === "link" ? "url" : "text", true)}{area("note", "Material note (optional)")}</>}
      <div className={`${styles.actions} ${styles.full}`}><button type="button" className="secondary-button" onClick={closeEditor}>Cancel</button><button className="primary-button" type="submit">{busy ? "Uploading…" : "Save"}</button></div></fieldset></form></ExamDialog>}
    {deleting && <ExamDialog title="Confirm deletion" close={closeEditor}><p>Delete “{deleting.title}”?</p><p className={styles.meta}>{deleting.kind === "exam" ? "This exam and its checklist, notes and material links will leave the active lists. Uploaded files are retained." : deleting.kind === "material" ? "This removes the material from this exam. The original file is retained." : "This item will be removed from this exam."}</p>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button className="secondary-button" onClick={closeEditor}>Cancel</button><button className="primary-button" onClick={removeConfirmed}>Delete</button></div></ExamDialog>}
    {preview && <StoragePreview file={preview} close={() => setPreview(null)} />}
  </div>;
}
