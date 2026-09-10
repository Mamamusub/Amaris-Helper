"use client";
import { useState } from "react";
import type { Task } from "@/lib/types";
import { calendarTimeZone, dayKey } from "@/lib/calendar";
import { repeatSummary } from "@/lib/task-recurrence";

export function Subtasks({ items = [], onChange }: { items?: NonNullable<Task["subtasks"]>; onChange: (items: NonNullable<Task["subtasks"]>) => void }) {
  const [title, setTitle] = useState("");
  const [removed, setRemoved] = useState<{ item: NonNullable<Task["subtasks"]>[number]; index: number } | null>(null);
  const add = () => { if (title.trim()) { onChange([...items, { id: crypto.randomUUID(), title: title.trim(), done: false }]); setTitle(""); } };
  return <details className="subtask-section" open><summary>งานย่อย · {items.filter((item) => item.done).length}/{items.length}</summary>
    {!items.length && <p className="muted">แบ่งงานเป็นขั้นตอนเล็ก ๆ เพื่อเริ่มได้ง่ายขึ้น</p>}
    {items.map((item, index) => <div className="subtask-line" key={item.id}><input type="checkbox" aria-label={`เสร็จ: ${item.title}`} checked={item.done} onChange={(event) => onChange(items.map((old) => old.id === item.id ? { ...old, done: event.target.checked } : old))} /><input aria-label="ชื่องานย่อย" value={item.title} onChange={(event) => onChange(items.map((old) => old.id === item.id ? { ...old, title: event.target.value } : old))} /><button type="button" className="secondary-button" aria-label={`ลบ ${item.title}`} onClick={() => { setRemoved({ item, index }); onChange(items.filter((old) => old.id !== item.id)); }}>×</button></div>)}
    <div className="subtask-line"><input aria-label="เพิ่มงานย่อย" placeholder="เพิ่มขั้นตอน แล้วกด Enter" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); } }} /><button type="button" className="secondary-button" disabled={!title.trim()} onClick={add}>เพิ่ม</button></div>
    {removed && <p role="status">ลบงานย่อยแล้ว <button type="button" className="secondary-button" onClick={() => { const next = [...items]; next.splice(removed.index, 0, removed.item); onChange(next); setRemoved(null); }}>ย้อนกลับ</button></p>}
  </details>;
}
export function RepeatEditor({ task, change, disabled = false }: { task: Task; change: (patch: Partial<Task>) => void; disabled?: boolean }) {
  const rule = task.repeat;
  return <fieldset className="repeat-editor" disabled={disabled}><legend>ทำซ้ำ</legend><label>ความถี่<select value={rule?.frequency ?? "none"} onChange={(event) => { const frequency = event.target.value; const anchor = task.deadline || dayKey(new Date()); change({ repeat: frequency === "none" ? undefined : { frequency: frequency as NonNullable<Task["repeat"]>["frequency"], weekdays: [new Date(`${anchor}T12:00:00Z`).getUTCDay()], anchor, timeZone: calendarTimeZone }, deadline: task.deadline || anchor, occurrenceDate: task.occurrenceDate || anchor, seriesId: task.seriesId || task.id }); }}><option value="none">ไม่ซ้ำ</option><option value="daily">ทุกวัน</option><option value="weekly">ทุกสัปดาห์</option><option value="monthly">ทุกเดือน</option></select></label>
    {rule && <><p className="muted">{repeatSummary(rule)}</p>{rule.frequency === "weekly" && <div className="weekday-options">{["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((label, day) => <button type="button" key={day} aria-pressed={rule.weekdays.includes(day)} className="secondary-button" onClick={() => { const days = rule.weekdays.includes(day) ? rule.weekdays.filter((value) => value !== day) : [...rule.weekdays, day].sort(); if (days.length) change({ repeat: { ...rule, weekdays: days } }); }}>{label}</button>)}</div>}<label>วันสิ้นสุด (เว้นว่างเพื่อทำต่อเนื่อง)<input type="date" min={task.deadline} value={rule.until ?? ""} onChange={(event) => change({ repeat: { ...rule, until: event.target.value || undefined } })} /></label><label>เขตเวลา<select value={rule.timeZone} onChange={(event) => change({ repeat: { ...rule, timeZone: event.target.value } })}>{Array.from(new Set([calendarTimeZone, Intl.DateTimeFormat().resolvedOptions().timeZone, rule.timeZone, "UTC", "America/New_York", "Europe/London"])).map((zone) => <option key={zone}>{zone}</option>)}</select></label><small>วันครบกำหนดเป็นวันที่ตามปฏิทิน · เพิ่ม Google Calendar แยกแต่ละรอบด้วยปุ่มเดิม · การแก้ไขไม่ซิงก์อัตโนมัติ</small></>}
  </fieldset>;
}
