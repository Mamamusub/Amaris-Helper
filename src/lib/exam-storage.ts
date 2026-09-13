import type { Subject } from "./types";
export const EXAM_KEY = "amaris.exam.info";
export const CHECKLIST_KEY = "amaris.exam.checklist";
export const EXAM_CHANGED = "amaris:exam-changed";
export type ExamInfo = { id: string; date: string; time: string; room: string; type: "Quiz" | "Midterm" | "Final"; calendarName: string };
export type ExamMap = Record<string, ExamInfo[]>;
export type ChecklistItem = { id: string; text: string; done: boolean; doneAt?: string };
export type ChecklistMap = Record<string, ChecklistItem[]>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" ? value : "";
export function dateNumber(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value : NaN;
}
export function readExamData(storage: Pick<Storage, "getItem">) {
  const read = (key: string): Record<string, unknown> => { try { const value: unknown = JSON.parse(storage.getItem(key) ?? "{}"); return object(value) ? value : {}; } catch { return {}; } };
  const exams: ExamMap = Object.fromEntries(Object.entries(read(EXAM_KEY)).map(([subjectId, value]) => [subjectId, (Array.isArray(value) ? value : [value]).filter(object).map((exam, index): ExamInfo => ({ id: text(exam.id) || `legacy-${subjectId}-${index}`, date: text(exam.date), time: /^([01]\d|2[0-3]):[0-5]\d$/.test(text(exam.time)) ? text(exam.time) : "", room: text(exam.room), type: exam.type === "Quiz" || exam.type === "Final" ? exam.type : "Midterm", calendarName: text(exam.calendarName) }))]));
  const checklists: ChecklistMap = Object.fromEntries(Object.entries(read(CHECKLIST_KEY)).map(([subjectId, value]) => [subjectId, (Array.isArray(value) ? value : []).filter(object).filter((item) => typeof item.text === "string").map((item, index) => ({ id: text(item.id) || `legacy-topic-${subjectId}-${index}`, text: text(item.text), done: item.done === true, ...(typeof item.doneAt === "string" ? { doneAt: item.doneAt } : {}) }))]));
  return { exams, checklists };
}
export function upcomingExams(subjects: Subject[], data: ReturnType<typeof readExamData>, today: string) {
  return subjects.flatMap((subject) => (data.exams[subject.id] ?? []).flatMap((exam) => {
    const days = Math.round((dateNumber(exam.date) - dateNumber(today)) / 86400000);
    if (!Number.isFinite(days) || days < 0) return [];
    const checklist = data.checklists[subject.id] ?? [];
    const done = checklist.filter((item) => item.done).length;
    return [{ ...exam, subjectId: subject.id, subjectName: subject.name, days, total: checklist.length, done, progress: checklist.length ? Math.round(done / checklist.length * 100) : 0, urgency: days === 0 ? "Today" : days <= 3 ? "Urgent" : days <= 7 ? "Soon" : "Normal" }];
  })).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.subjectName.localeCompare(b.subjectName) || a.id.localeCompare(b.id));
}
