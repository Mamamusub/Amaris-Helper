"use client";
import { useEffect, useState } from "react";
import { useAccountStorage } from "./account-boundary";
import type { Subject } from "@/lib/types";
import { dayKey } from "@/lib/calendar";
import { CHECKLIST_KEY, EXAM_CHANGED, EXAM_KEY, readExamData, upcomingExams } from "@/lib/exam-storage";
import styles from "./next-exams.module.css";

export default function NextExams({ subjects, onOpenExam }: { subjects: Subject[]; onOpenExam: (subjectId: string) => void }) {
  const accountStorage = useAccountStorage();
  const read = () => { try { return readExamData(accountStorage); } catch { return { exams: {}, checklists: {} }; } };
  const [data, setData] = useState(read);
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const refresh = () => { setData(readExamData(accountStorage)); setToday(dayKey(new Date())); };
    const storage = (event: StorageEvent) => { if (!event.key || [EXAM_KEY, CHECKLIST_KEY].includes(event.key)) refresh(); };
    const timer = setInterval(() => setToday(dayKey(new Date())), 30000);
    window.addEventListener("storage", storage); window.addEventListener(EXAM_CHANGED, refresh); window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("storage", storage); window.removeEventListener(EXAM_CHANGED, refresh); window.removeEventListener("focus", refresh); };
  }, [accountStorage]);
  const exams = upcomingExams(subjects, data, today).slice(0, 3);
  return <section className={`panel ${styles.section}`} aria-labelledby="next-exams-title"><div className="panel-heading"><div><span className="eyebrow">STUDY AHEAD</span><h3 id="next-exams-title">Next Exams</h3></div></div>{!exams.length ? <div className={styles.empty}>No upcoming exams</div> : <div className={styles.grid}>{exams.map((exam, index) => <article key={`${exam.subjectId}-${exam.id}-${index}`} className={styles.card}><div className={styles.top}><span>{exam.type}</span><span className={`${styles.badge} ${styles[exam.urgency]}`}>{exam.urgency}</span></div><h4>{exam.subjectName}</h4><p>{new Date(`${exam.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{exam.time && ` · ${exam.time}`}</p><strong className={styles.remaining}>{exam.days === 0 ? "Today" : `${exam.days} ${exam.days === 1 ? "day" : "days"} left`}</strong><div className={styles.progress}><span>{exam.total ? `Study checklist · ${exam.done}/${exam.total} (${exam.progress}%)` : "No study topics yet"}</span><progress max={100} value={exam.progress} aria-label={`${exam.subjectName} study checklist`} /></div>{exam.days <= 7 && <p className={styles.suggested}>Suggested Next · เตรียมตัวสอบวิชานี้</p>}<button className="secondary-button" onClick={() => onOpenExam(exam.subjectId)}>Open Exam ↗</button></article>)}</div>}</section>;
}
