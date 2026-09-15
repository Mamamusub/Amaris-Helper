"use client";
import { useEffect, useState } from "react";
import { useAccountStorage } from "./account-boundary";
import type { Subject, Task } from "@/lib/types";
import { dayKey } from "@/lib/calendar";
import { CHECKLIST_KEY, EXAM_CHANGED, EXAM_KEY, readExamData } from "@/lib/exam-storage";
import { DEFAULT_SEMESTER, semesterOptions, semesterSummary } from "@/lib/semester-summary";
import { focusDuration } from "@/lib/focus-history";
import styles from "./semester-view.module.css";

export default function SemesterView({ subjects, tasks, onStudy, onExam, loading = false }: { subjects: Subject[]; tasks: Task[]; onStudy: (id: string) => void; onExam: (id: string) => void; loading?: boolean }) {
  const accountStorage = useAccountStorage();
  const read = () => { try { return readExamData(accountStorage); } catch { return { exams: {}, checklists: {} }; } };
  const [semester, setSemester] = useState(DEFAULT_SEMESTER);
  const [data, setData] = useState(read);
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const refresh = () => { setData(readExamData(accountStorage)); setToday(dayKey(new Date())); };
    const storage = (event: StorageEvent) => { if (!event.key || event.key === EXAM_KEY || event.key === CHECKLIST_KEY) refresh(); };
    const timer = setInterval(() => setToday(dayKey(new Date())), 30000);
    window.addEventListener("storage", storage); window.addEventListener(EXAM_CHANGED, refresh); window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("storage", storage); window.removeEventListener(EXAM_CHANGED, refresh); window.removeEventListener("focus", refresh); };
  }, [accountStorage]);
  const options = semesterOptions(subjects);
  const selected = options.includes(semester) ? semester : DEFAULT_SEMESTER;
  const summary = semesterSummary(subjects, tasks, data, selected, today);
  const stats = [["Subjects", summary.subjects], ["Open assignments", summary.open], ["Upcoming exams", summary.exams], ["Exam preparation", `${summary.preparation}%`], ["Focus time this week", focusDuration(summary.focusMs)], ["Completed tasks this semester", summary.completedTasks]];
  return <div className={`content ${styles.page}`}><header className={styles.heading}><div><span className="section-kicker">YOUR SEMESTER AT A GLANCE</span><h2>Semester {selected}</h2><p>ภาพรวมวิชา งาน และการเตรียมสอบในที่เดียว</p></div><label>Semester<select value={selected} onChange={(e) => setSemester(e.target.value)}>{options.map((id) => <option key={id}>{id}</option>)}</select></label></header>
    {loading && <p role="status">กำลังโหลดข้อมูลบัญชี…</p>}
    <div className={styles.stats}>{stats.map(([label, value]) => <section key={label} className={styles.stat}><span>{label}</span><strong>{loading ? "…" : value}</strong>{label === "Exam preparation" && <small>{summary.done}/{summary.total} study topics</small>}</section>)}</div>
    <section className={`panel ${styles.week}`}><div><span className="eyebrow">MONDAY — SUNDAY</span><h3>This Week</h3><p>{summary.week.from} — {summary.week.to}</p></div><div className={styles.weekStats}><div><strong>{summary.week.tasks}</strong><span>Open tasks due</span></div><div><strong>{summary.week.exams}</strong><span>Exams this week</span></div><div><strong>{focusDuration(summary.focusMs)}</strong><span>Focus time</span></div><div><strong>{summary.week.completedTopics}</strong><span>Topics completed*</span></div></div><small>*นับหัวข้อที่ยังติ๊กเสร็จและมีเวลาสำเร็จในสัปดาห์นี้{summary.week.undatedTopics > 0 && ` · อีก ${summary.week.undatedTopics} หัวข้อเก่าไม่ทราบวันที่สำเร็จ`}</small></section>
    <section className={`panel ${styles.section}`}><div className="panel-heading"><div><span className="eyebrow">WHAT COMES NEXT</span><h3>Upcoming Timeline</h3></div><span className="muted">{summary.timeline.length} events</span></div>{!summary.timeline.length ? <p className={styles.empty}>{loading ? "Loading…" : "No upcoming assignments or exams"}</p> : <div className={styles.timeline}>{summary.timeline.map((item, index) => <button key={`${item.id}-${index}`} className={styles.event} onClick={() => item.label === "Assignment" ? onStudy(item.subjectId) : onExam(item.subjectId)}><time dateTime={item.date}>{new Date(`${item.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</time><span className={styles.eventBody}><strong>{item.title}</strong><small>{item.subjectName}{item.time && ` · ${item.time}`}</small></span><span className={styles.label}>{item.label}</span><span aria-hidden="true">↗</span></button>)}</div>}</section>
    <section className={styles.section}><div className="panel-heading"><div><span className="eyebrow">PREPARATION & WORKLOAD</span><h3>Subject Overview</h3></div></div>{!summary.cards.length ? <div className={`panel ${styles.empty}`}>{loading ? "Loading subjects…" : "No subjects in this semester. เพิ่มวิชาในหน้า Study เพื่อเริ่มต้น"}</div> : <div className={styles.subjects}>{summary.cards.map((card) => <article className={`panel ${styles.card}`} key={card.subject.id}><div className={styles.cardHeading}><h4>{card.subject.name}</h4><span className={`${styles.badge} ${styles[card.health]}`}>{card.health}</span></div><p className={styles.reason}>{card.reason}</p><div className={styles.counts}><span><strong>{card.open}</strong> open assignments</span><span><strong>{card.exams}</strong> upcoming exams</span></div><div className={styles.preparation}><span>Study preparation</span><strong>{card.preparation}%</strong></div><progress max={100} value={card.preparation} aria-label={`${card.subject.name} study preparation`} /><small>{card.total ? `${card.completed}/${card.total} checklist topics complete` : "No study topics yet"}</small><p>{card.nextExam ? `Next exam: ${card.nextExam.type} ${card.nextExam.days === 0 ? "today" : `in ${card.nextExam.days} days`}` : "No upcoming exams"}</p><div className={styles.actions}><button className="secondary-button" onClick={() => onStudy(card.subject.id)}>Open Study</button><button className="text-button" onClick={() => onExam(card.subject.id)}>Open Exam ↗</button></div></article>)}</div>}</section>
    <p className={styles.note}>วิชาที่ไม่ระบุเทอมใช้ {DEFAULT_SEMESTER} · นับงานจากวิชาในเทอม ไม่ใช้ช่วงวันเปิด–ปิดเทอม · Focus นับ session ที่บันทึกแล้วตามวันเริ่ม เช่นเดียวกับหน้า Focus · งานที่ไม่ผูกวิชาไม่นับในหน้านี้</p>
  </div>;
}
