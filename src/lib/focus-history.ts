import type { FocusRecord, Subject, Task } from "./types";
import type { FocusSession } from "./focus-timer";
import { calendarTimeZone, shiftDay } from "./calendar";

export type FocusRange = { from: string; to: string };
export type HistoryRow = { record: FocusRecord; task: Task; title: string; day: string | null; subjectId: string; subjectName: string; color?: string; pausedMs: number | null };
export const historyDay = (stamp: number, zone = calendarTimeZone) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(stamp));
const validStamp = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 8640000000000000;
export function focusRange(period: "today" | "week" | "month", today: string): FocusRange {
  if (period === "today") return { from: today, to: today };
  if (period === "week") { const from = shiftDay(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7)); return { from, to: shiftDay(from, 6) }; }
  const from = `${today.slice(0, 7)}-01`;
  const date = new Date(`${from}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0);
  return { from, to: date.toISOString().slice(0, 10) };
}
export function validRange(range: FocusRange) {
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  return valid(range.from) && valid(range.to) && range.from <= range.to;
}
export function focusDuration(ms: number) {
  if (ms <= 0) return "0 นาที";
  if (ms < 60000) return "น้อยกว่า 1 นาที";
  const minutes = Math.floor(ms / 60000), hours = Math.floor(minutes / 60);
  return hours ? `${hours} ชม.${minutes % 60 ? ` ${minutes % 60} นาที` : ""}` : `${minutes} นาที`;
}
export function snapshotFocus(session: FocusSession, task: Task, subjects: Subject[]): FocusRecord {
  const subject = subjects.find((item) => item.id === task.subjectId);
  return { id: session.id, startedAt: session.startedAt, endedAt: session.endedAt!, elapsedMs: session.elapsedMs, note: session.note, intervals: session.intervals, durationMs: session.durationMs, pausedMs: Math.max(0, session.endedAt! - session.startedAt - session.elapsedMs), outcome: session.elapsedMs >= session.durationMs ? "completed" : "ended-early", snapshot: { taskTitle: task.title, subjectId: task.subjectId ?? null, subjectName: subject?.name ?? (task.subjectId ? "วิชาที่ไม่มีข้อมูลชื่อ" : null), subjectColor: subject?.color } };
}
export function focusHistory(tasks: Task[], subjects: Subject[], zone = calendarTimeZone): HistoryRow[] {
  const seen = new Set<string>();
  return tasks.flatMap((task) => (task.focusSessions ?? []).flatMap((record): HistoryRow[] => {
    if (!record.id || seen.has(record.id) || !Number.isFinite(record.elapsedMs) || record.elapsedMs <= 0) return [];
    seen.add(record.id);
    const currentSubject = subjects.find((item) => item.id === task.subjectId);
    const subjectId = record.snapshot ? record.snapshot.subjectId ?? currentSubject?.id : task.subjectId;
    const subject = subjects.find((item) => item.id === subjectId);
    const completeIntervals = record.intervals?.length && record.intervals.every((span) => validStamp(span.start) && validStamp(span.end) && span.end >= span.start) && Math.abs(record.intervals.reduce((sum, span) => sum + span.end - span.start, 0) - record.elapsedMs) < 1;
    const pausedMs = Number.isFinite(record.pausedMs) && record.pausedMs! >= 0 ? record.pausedMs! : completeIntervals && validStamp(record.startedAt) && validStamp(record.endedAt) && record.endedAt - record.startedAt >= record.elapsedMs ? record.endedAt - record.startedAt - record.elapsedMs : null;
    return [{ record, task, title: record.snapshot?.taskTitle ?? task.title, day: validStamp(record.startedAt) ? historyDay(record.startedAt, zone) : null, subjectId: subjectId ?? "__unassigned", subjectName: subjectId ? (subject?.name ?? record.snapshot?.subjectName ?? "วิชาที่ไม่มีข้อมูลชื่อ") : "ไม่ระบุวิชา", color: record.snapshot ? record.snapshot.subjectColor : subject?.color, pausedMs }];
  })).sort((a, b) => (b.record.startedAt || 0) - (a.record.startedAt || 0));
}
export function summarizeFocus(rows: HistoryRow[], range: FocusRange, subjects: Subject[] = []) {
  const selected = validRange(range) ? rows.filter((row) => row.day && row.day >= range.from && row.day <= range.to) : [];
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const groups = new Map<string, { id: string; name: string; color?: string; elapsedMs: number; rows: HistoryRow[] }>();
  for (const row of selected) {
    const currentSubject = subjectMap.get(row.subjectId);
    const group = groups.get(row.subjectId) ?? { id: row.subjectId, name: currentSubject?.name ?? row.subjectName, color: currentSubject?.color ?? row.color, elapsedMs: 0, rows: [] };
    group.elapsedMs += row.record.elapsedMs; group.rows.push(row); groups.set(row.subjectId, group);
  }
  return { elapsedMs: selected.reduce((sum, row) => sum + row.record.elapsedMs, 0), count: selected.length, subjectCount: [...groups.keys()].filter((id) => id !== "__unassigned").length, groups: [...groups.values()].sort((a, b) => b.elapsedMs - a.elapsedMs || a.name.localeCompare(b.name, "th")) };
}
export function sessionClock(record: FocusRecord, zone = calendarTimeZone) {
  const time = (stamp: number) => new Intl.DateTimeFormat("th-TH", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(stamp));
  if (!validStamp(record.startedAt) || !validStamp(record.endedAt)) return "ไม่มีข้อมูลเวลาเริ่ม–สิ้นสุด";
  if (historyDay(record.startedAt, zone) !== historyDay(record.endedAt, zone)) return `${historyDay(record.startedAt, zone)} ${time(record.startedAt)} – ${historyDay(record.endedAt, zone)} ${time(record.endedAt)} (ข้ามวัน)`;
  return `${time(record.startedAt)}–${time(record.endedAt)}`;
}
