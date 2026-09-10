"use client";
import { useContext, useEffect, useMemo, useState } from "react";
import type { Subject, Task } from "@/lib/types";
import type { FocusSession } from "@/lib/focus-timer";
import { calendarTimeZone, dayKey } from "@/lib/calendar";
import { focusDuration, focusHistory, focusRange, sessionClock, summarizeFocus, validRange, type HistoryRow } from "@/lib/focus-history";
import { TaskContext } from "./task-controls";

type Period = "today" | "week" | "month" | "custom";
const dateLabel = (day: string) => new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

function HistoryRows({ rows }: { rows: HistoryRow[] }) {
  const { edit } = useContext(TaskContext);
  const [limit, setLimit] = useState(20);
  const days = new Map<string, HistoryRow[]>();
  for (const row of rows) { const day = row.day ?? "unknown"; const list = days.get(day) ?? []; list.push(row); days.set(day, list); }
  let offset = 0;
  return <div className="focus-day-list">{[...days].map(([day, entries]) => {
    const visible = entries.slice(0, Math.max(0, limit - offset)); offset += entries.length;
    if (!visible.length) return null;
    return <section className="focus-day" key={day}><div className="focus-day-heading"><h4>{day === "unknown" ? "ไม่มีข้อมูลวันที่เริ่ม" : dateLabel(day)}</h4><span>รวม {focusDuration(entries.reduce((sum, row) => sum + row.record.elapsedMs, 0))}</span></div>
      {visible.map((row) => <article className="focus-history-row" key={row.record.id}>
        <div>{row.task.deletedAt ? <strong>{row.title}</strong> : <button className="focus-task-link" onClick={() => edit(row.task)}>{row.title} <span aria-hidden="true">↗</span></button>}{row.task.deletedAt && <span className="focus-history-tag">งานถูกลบแล้ว</span>}
          <p className="focus-history-meta">{sessionClock(row.record)} · โฟกัส {focusDuration(row.record.elapsedMs)} · {row.pausedMs === null ? "ไม่มีข้อมูลเวลาพัก" : `พัก ${focusDuration(row.pausedMs)}`}</p>
          <p className="focus-history-meta">{row.record.snapshot && row.record.snapshot.subjectName && <span>วิชา ณ เวลาบันทึก: {row.record.snapshot.subjectName} · </span>}{row.record.outcome === "completed" ? "จบครบเวลา" : row.record.outcome === "ended-early" ? "จบก่อนเวลา" : "ไม่มีข้อมูลสถานะการจบ"}</p>
        </div><span className="focus-session-duration">{focusDuration(row.record.elapsedMs)}</span>
      </article>)}
    </section>;
  })}{rows.length > limit && <button className="secondary-button focus-load-more" onClick={() => setLimit((value) => value + 20)}>โหลดเพิ่มเติม · เหลือ {rows.length - limit} รอบ</button>}</div>;
}

export default function FocusDashboard({ tasks, subjects, session, loading = false, error = "", retry, chooseTasks }: { tasks: Task[]; subjects: Subject[]; session: FocusSession | null; loading?: boolean; error?: string; retry: () => void; chooseTasks: () => void }) {
  const { focus } = useContext(TaskContext);
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [period, setPeriod] = useState<Period>("week");
  const [custom, setCustom] = useState(() => focusRange("week", today));
  const [expanded, setExpanded] = useState<string[]>([]);
  const [undatedOpen, setUndatedOpen] = useState(false);
  useEffect(() => { const timer = setInterval(() => setToday(dayKey(new Date())), 30000); return () => clearInterval(timer); }, []);
  const range = period === "custom" ? custom : focusRange(period, today);
  const rows = useMemo(() => focusHistory(tasks, subjects), [tasks, subjects]);
  const { from, to } = range;
  const summary = useMemo(() => summarizeFocus(rows, { from, to }), [rows, from, to]);
  const undated = rows.filter((row) => !row.day);
  const activeTask = tasks.find((task) => task.id === session?.taskId);
  const recorded = session && rows.some((row) => row.record.id === session.id);
  const invalid = !validRange(range);
  return <div className="content focus-dashboard">
    <header className="focus-page-heading"><div><h2>Focus</h2><p>เวลาที่ให้กับการเรียนรู้ ทีละรอบ</p></div><label className="focus-range-select">ช่วงเวลา<select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="today">วันนี้</option><option value="week">สัปดาห์นี้</option><option value="month">เดือนนี้</option><option value="custom">กำหนดช่วงวันที่</option></select></label></header>
    {period === "custom" && <div className="focus-custom-range"><label>ตั้งแต่<input type="date" value={custom.from} onChange={(event) => setCustom({ ...custom, from: event.target.value })} /></label><label>ถึง<input type="date" min={custom.from} value={custom.to} onChange={(event) => setCustom({ ...custom, to: event.target.value })} /></label></div>}
    {invalid ? <p role="alert" className="focus-inline-error">เลือกวันที่ให้ครบ โดยวันสิ้นสุดต้องไม่ก่อนวันเริ่ม</p> : <p className="focus-range-caption">{dateLabel(range.from)} – {dateLabel(range.to)}</p>}
    <p className="focus-counting-note">เขตเวลา {calendarTimeZone} · รอบข้ามวันนับทั้งรอบตามวันที่เริ่ม · รวมเฉพาะประวัติที่บันทึกแล้ว</p>
    {rows.some((row) => !row.record.snapshot) && <p className="focus-counting-note">ประวัติเก่าที่ยังไม่มีชื่อ ณ เวลาบันทึก ใช้ชื่องานและวิชาที่มีอยู่ปัจจุบัน</p>}
    {session && <div className="focus-active-banner" role="status"><span className="focus-active-mark" aria-hidden="true">◷</span><div><strong>{session.endedAt ? recorded ? "รอบล่าสุดบันทึกแล้ว" : "จบรอบแล้ว · รอบันทึกประวัติ" : session.runningSince === null ? "มีรอบที่หยุดพักอยู่" : "กำลังโฟกัส"} {activeTask && `· ${activeTask.title}`}</strong><p>{session.endedAt && recorded ? "ยอดรวมแสดงตามช่วงวันที่ที่เลือก" : "รอบนี้ยังไม่รวมในสถิติด้านล่าง"}</p></div>{activeTask ? <button className="secondary-button" onClick={() => focus(session.taskId)}>กลับไปตัวจับเวลา</button> : <span>ไม่พบงานของรอบนี้</span>}</div>}
    {error && <div className="focus-inline-error" role="alert"><p>{error} · ประวัติที่มีในเครื่องยังแสดงได้</p><button className="secondary-button" onClick={retry}>ลองใหม่</button></div>}
    {loading ? <div className="focus-loading" role="status">กำลังโหลดประวัติโฟกัส…</div> : !invalid && <>
      <section className="focus-stat-grid" aria-label="สรุปช่วงเวลาที่เลือก"><div className="focus-stat primary"><span>โฟกัสรวม</span><strong>{focusDuration(summary.elapsedMs)}</strong></div><div className="focus-stat"><span>รอบที่บันทึก</span><strong>{summary.count} <small>รอบ</small></strong></div><div className="focus-stat"><span>วิชาที่โฟกัส</span><strong>{summary.subjectCount} <small>วิชา</small></strong><small>ไม่รวมงานที่ไม่ระบุวิชา</small></div></section>
      {!rows.length ? <section className="focus-empty"><span aria-hidden="true">◷</span><h3>ยังไม่มีประวัติโฟกัส</h3><p>เลือกงานแล้วเริ่มโฟกัส เมื่อบันทึกรอบแรกจะเห็นเวลาที่นี่</p><button className="primary-button" onClick={chooseTasks}>ไปเลือกงาน</button></section> : !summary.count ? <section className="focus-empty"><h3>ไม่มีรอบโฟกัสในช่วงนี้</h3><p>ลองเลือกช่วงวันที่ที่เคยบันทึกรอบโฟกัส</p><button className="secondary-button" onClick={() => { const dated = rows.filter((row) => row.day); if (dated.length) setCustom({ from: dated.at(-1)!.day!, to: dated[0].day! }); setPeriod("custom"); }}>เปลี่ยนช่วงวันที่</button></section> : <section className="focus-subject-list" aria-label="สรุปแยกตามวิชา">{summary.groups.map((group, index) => {
        const isOpen = expanded.includes(group.id), panelId = `focus-subject-${index}`, percent = summary.elapsedMs ? group.elapsedMs / summary.elapsedMs * 100 : 0;
        const color = group.color && /^#[\da-f]{3,8}$/i.test(group.color) ? group.color : "#afbc92";
        return <section className="focus-subject" key={group.id}><h3><button className="focus-subject-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setExpanded((old) => isOpen ? old.filter((id) => id !== group.id) : [...old, group.id])}><span className="focus-disclosure" aria-hidden="true">{isOpen ? "▾" : "▸"}</span><span className="focus-subject-color" style={{ backgroundColor: color }} aria-hidden="true" /><span className="focus-subject-name">{group.name}<small>{group.rows.length} รอบ · {percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}% ของเวลารวม · {isOpen ? "ยุบประวัติ" : "ขยายประวัติ"}</small></span><strong>{focusDuration(group.elapsedMs)}</strong></button></h3><div className="focus-share-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div><div id={panelId} hidden={!isOpen}>{isOpen && <HistoryRows key={`${range.from}:${range.to}`} rows={group.rows} />}</div></section>;
      })}</section>}
      {!!undated.length && <section className="focus-undated"><button className="secondary-button" aria-expanded={undatedOpen} aria-controls="focus-undated-history" onClick={() => setUndatedOpen(!undatedOpen)}>{undatedOpen ? "▾" : "▸"} ประวัติที่ไม่มีวันที่เริ่ม · {undated.length} รอบ</button><p className="focus-counting-note">ยังอ่านประวัติได้ แต่ไม่นำมารวมในช่วงวันที่ เพราะไม่มีข้อมูลวันที่เริ่ม</p><div id="focus-undated-history" hidden={!undatedOpen}>{undatedOpen && <HistoryRows rows={undated} />}</div></section>}
    </>}
  </div>;
}
