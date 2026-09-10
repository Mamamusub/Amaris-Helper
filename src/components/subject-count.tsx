"use client";
import { useState } from "react";
import { dayKey } from "@/lib/calendar";
import { shiftMonth, subjectMonth } from "@/lib/subject-counts";
import type { Subject, Task } from "@/lib/types";

export default function SubjectCount({ subject, tasks }: { subject: Subject; tasks: Task[] }) {
  const [month, setMonth] = useState(() => dayKey(new Date()).slice(0, 7));
  const [selected, setSelected] = useState("");
  const history = subjectMonth(tasks, subject.id, month);
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const changeMonth = (next: string) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(next)) { setMonth(next); setSelected(""); } };
  const selectedDay = history.days.find((day) => day.date === selected);
  return <section className="subject-count" aria-label={`Count ${subject.name}`}>
    <div className="subject-count-heading"><h4>Count</h4><div className="subject-count-nav"><button type="button" aria-label="เดือนก่อนหน้า" onClick={() => changeMonth(shiftMonth(month, -1))}>‹</button><input type="month" aria-label="เดือนของประวัติวิชา" value={month} onChange={(event) => changeMonth(event.target.value)} /><button type="button" aria-label="เดือนถัดไป" onClick={() => changeMonth(shiftMonth(month, 1))}>›</button></div></div>
    <div className="subject-count-body"><div className="subject-mini-calendar" aria-label={`ประวัติ ${monthLabel}`}>
      {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((day) => <span className="subject-weekday" key={day}>{day}</span>)}
      {Array.from({ length: history.offset }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
      {history.days.map((day, i) => <button type="button" key={day.date} className={day.tasks.length ? "has-count" : ""} aria-label={`${day.date} · ${day.tasks.length} ครั้ง`} aria-pressed={selected === day.date} onClick={() => setSelected(day.date)}><span>{i + 1}</span>{day.tasks.length > 0 && <small>{day.tasks.length}</small>}</button>)}
    </div><div className="subject-count-total" aria-live="polite"><span>{monthLabel}</span><strong>{history.count}</strong><span>ครั้ง</span><small>งานที่ทำเสร็จแล้ว</small></div></div>
    <p className="subject-count-note">1 งานที่กด Complete = 1 ครั้ง · แสดงตามวันกำหนดส่งของงาน ไม่ใช่วันที่กด Complete</p>
    {selectedDay ? <div className="subject-count-detail"><strong>{selectedDay.date} · {selectedDay.tasks.length} ครั้ง</strong>{selectedDay.tasks.length ? <ul>{selectedDay.tasks.map((task) => <li key={task.id}>{task.title}</li>)}</ul> : <p>ไม่มีงานที่ทำเสร็จในวันนี้</p>}</div> : <p className="subject-count-note">{history.count ? "กดวันที่เพื่อดูงานที่ทำเสร็จ" : "ยังไม่มีประวัติงานที่ทำเสร็จในเดือนนี้"}</p>}
  </section>;
}
