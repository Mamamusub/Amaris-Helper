import type { Task } from "./types";
import { shiftDay } from "./calendar";

export function nextOccurrence(rule: NonNullable<Task["repeat"]>, after: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(after) || !rule.anchor) return null;
  let next = shiftDay(after, 1);
  if (rule.frequency === "weekly") {
    const days = rule.weekdays.length ? rule.weekdays : [new Date(`${rule.anchor}T12:00:00Z`).getUTCDay()];
    for (let i = 0; i < 7 && !days.includes(new Date(`${next}T12:00:00Z`).getUTCDay()); i++) next = shiftDay(next, 1);
  }
  if (rule.frequency === "monthly") {
    const date = new Date(`${after}T12:00:00Z`);
    const day = Number(rule.anchor.slice(8));
    const candidate = (offset: number) => {
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0));
      last.setUTCDate(Math.min(day, last.getUTCDate()));
      return last.toISOString().slice(0, 10);
    };
    next = candidate(0) > after ? candidate(0) : candidate(1);
  }
  return rule.until && next > rule.until ? null : next;
}
export function recurrenceToday(rule: NonNullable<Task["repeat"]>, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: rule.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function nextForTask(task: Task): string | null {
  if (!task.repeat) return null;
  let next = nextOccurrence(task.repeat, task.occurrenceDate || task.deadline);
  while (next && task.skipBefore && next < task.skipBefore) next = nextOccurrence(task.repeat, next);
  return next;
}
export function advanceRecurring(tasks: Task[], now = new Date()): Task[] {
  const result = [...tasks];
  for (const task of tasks) {
    if (!task.repeat || task.recurrenceHandled || (task.status !== "Done" && !task.deletedAt)) continue;
    const next = nextForTask(task);
    if (next && next < recurrenceToday(task.repeat, now) && !task.skipBefore) continue;
    result[result.findIndex((item) => item.id === task.id)] = { ...task, recurrenceHandled: true };
    if (!next) continue;
    const seriesId = task.seriesId || task.id;
    const id = `repeat:${seriesId}:${next}`;
    if (result.some((item) => item.id === id)) continue;
    result.unshift({ ...task, ...task.nextTemplate, nextTemplate: undefined, id, seriesId, occurrenceDate: next, deadline: next, status: "Planned", subtasks: (task.nextTemplate?.subtasks ?? task.subtasks ?? []).map((item) => ({ ...item, done: false })), sourceEventId: undefined, deletionBatch: undefined, recurrenceWasHandled: undefined, focusSessions: [], focused: false, deletedAt: undefined, recurrenceHandled: false, skipBefore: undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  return result;
}
const weekdays = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export function repeatSummary(rule: Task["repeat"]) {
  if (!rule) return "ไม่ซ้ำ";
  const text = rule.frequency === "daily" ? "ทุกวัน" : rule.frequency === "monthly" ? `ทุกเดือน วันที่ ${Number(rule.anchor.slice(8))} (ใช้วันสุดท้ายหากเดือนสั้นกว่า)` : `ทุก${rule.weekdays.map((day) => weekdays[day]).join("และ")}`;
  return text + (rule.until ? ` · ถึง ${rule.until}` : " · ต่อเนื่อง");
}

function template(task: Task): NonNullable<Task["nextTemplate"]> {
  return { title: task.title, description: task.description, subtasks: task.subtasks, repeat: task.repeat, color: task.color, priority: task.priority, subjectId: task.subjectId, team: task.team, assignedAgent: task.assignedAgent };
}

export function editRecurring(tasks: Task[], draft: Task, scope: "this" | "future" = "future"): Task[] {
  const original = tasks.find((task) => task.id === draft.id);
  if (!original) return [draft, ...tasks];
  const updated = { ...original, ...draft, focusSessions: draft.focusSessions ?? original.focusSessions, updatedAt: new Date().toISOString() };
  if (!original.repeat) return tasks.map((task) => task.id === draft.id ? updated : task);
  if (scope === "this") return tasks.map((task) => task.id === draft.id ? { ...updated, repeat: original.repeat, occurrenceDate: original.occurrenceDate || original.deadline, nextTemplate: original.nextTemplate ?? template(original) } : task);
  const series = original.seriesId || original.id;
  const future = tasks.filter((task) => task.id !== original.id && !task.deletedAt && task.status !== "Done" && (task.seriesId || task.id) === series && (task.occurrenceDate || task.deadline) > (original.occurrenceDate || original.deadline)).sort((a, b) => (a.occurrenceDate || a.deadline).localeCompare(b.occurrenceDate || b.deadline));
  const changes = new Map<string, Task>([[updated.id, { ...updated, nextTemplate: undefined }]]);
  let cursor = updated.occurrenceDate || updated.deadline;
  for (const task of future) {
    const date = updated.repeat ? nextOccurrence(updated.repeat, cursor) : null;
    if (!date) {
      changes.set(task.id, { ...task, deletedAt: updated.updatedAt, deletionBatch: updated.id, recurrenceWasHandled: task.recurrenceHandled, recurrenceHandled: true });
      continue;
    }
    cursor = date;
    changes.set(task.id, { ...task, ...template(updated), subtasks: updated.subtasks?.map((item) => ({ ...item, done: task.subtasks?.find((old) => old.id === item.id)?.done ?? false })), nextTemplate: undefined, deadline: date, occurrenceDate: date, updatedAt: updated.updatedAt });
  }
  return tasks.map((task) => changes.get(task.id) ?? task);
}
