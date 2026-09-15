import type { Subject } from "./types";
export const EXAM_KEY = "amaris.exam.info";
export const CHECKLIST_KEY = "amaris.exam.checklist";
export const EXAM_CHANGED = "amaris:exam-changed";
export type ExamTopic = { id: string; examId: string; title: string; section: string; completed: boolean; order: number; createdAt: string; updatedAt: string; completedAt?: string };
export const materialTypes = ["Lecture", "Assignment", "Past Exam", "Formula Sheet", "Other"] as const;
export type ExamMaterial = { id: string; examId: string; name: string; type: typeof materialTypes[number]; url: string; note: string; source: "link" | "reference" | "file"; fileId?: string; fileArea?: "exam" | "study" | "exam-standalone"; createdAt: string; updatedAt: string };
export type ExamNote = { id: string; examId: string; content: string; pinned: boolean; createdAt: string; updatedAt: string };
export type ExamInfo = { id: string; date: string; time: string; room: string; type: "Quiz" | "Midterm" | "Final"; calendarName: string; subjectName?: string; endTime?: string; targetScore?: string; notes?: string; color?: string; createdAt?: string; updatedAt?: string; archivedAt?: string; deletedAt?: string; topics?: ExamTopic[]; materials?: ExamMaterial[]; formulaNotes?: ExamNote[] };
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
  const exams: ExamMap = Object.fromEntries(Object.entries(read(EXAM_KEY)).map(([subjectId, value]) => [subjectId, (Array.isArray(value) ? value : [value]).filter(object).map((exam, index): ExamInfo => ({ id: text(exam.id) || `legacy-${subjectId}-${index}`, date: text(exam.date), time: /^([01]\d|2[0-3]):[0-5]\d$/.test(text(exam.time)) ? text(exam.time) : "", room: text(exam.room), type: exam.type === "Quiz" || exam.type === "Final" ? exam.type : "Midterm", calendarName: text(exam.calendarName),
    ...Object.fromEntries(["subjectName", "endTime", "targetScore", "notes", "color", "createdAt", "updatedAt", "archivedAt", "deletedAt"].filter(key => typeof exam[key] === "string").map(key => [key, exam[key]])),
    ...(Array.isArray(exam.topics) ? { topics: exam.topics.filter(object).filter(item => typeof item.id === "string" && typeof item.title === "string").map((item, order) => ({ id: text(item.id), examId: text(exam.id), title: text(item.title), section: text(item.section), completed: item.completed === true, order: typeof item.order === "number" ? item.order : order, createdAt: text(item.createdAt), updatedAt: text(item.updatedAt), ...(typeof item.completedAt === "string" ? { completedAt: item.completedAt } : {}) })) } : {}),
    ...(Array.isArray(exam.materials) ? { materials: exam.materials.filter(object).filter(item => typeof item.id === "string" && typeof item.name === "string").map(item => ({ id: text(item.id), examId: text(exam.id), name: text(item.name), type: materialTypes.includes(item.type as typeof materialTypes[number]) ? item.type as typeof materialTypes[number] : "Other", url: text(item.url), note: text(item.note), source: item.source === "file" || item.source === "reference" ? item.source : "link", fileId: text(item.fileId), fileArea: item.fileArea === "study" || item.fileArea === "exam-standalone" ? item.fileArea : "exam", createdAt: text(item.createdAt), updatedAt: text(item.updatedAt) })) } : {}),
    ...(Array.isArray(exam.formulaNotes) ? { formulaNotes: exam.formulaNotes.filter(object).filter(item => typeof item.id === "string" && typeof item.content === "string").map(item => ({ id: text(item.id), examId: text(exam.id), content: text(item.content), pinned: item.pinned === true, createdAt: text(item.createdAt), updatedAt: text(item.updatedAt) })) } : {}),
  }))]));
  const checklists: ChecklistMap = Object.fromEntries(Object.entries(read(CHECKLIST_KEY)).map(([subjectId, value]) => [subjectId, (Array.isArray(value) ? value : []).filter(object).filter((item) => typeof item.text === "string").map((item, index) => ({ id: text(item.id) || `legacy-topic-${subjectId}-${index}`, text: text(item.text), done: item.done === true, ...(typeof item.doneAt === "string" ? { doneAt: item.doneAt } : {}) }))]));
  return { exams, checklists };
}
export function examChecklist(exam: ExamInfo, shared: ChecklistItem[] = []): ChecklistItem[] {
  return exam.topics ? exam.topics.map(topic => ({ id: topic.id, text: topic.title, done: topic.completed, doneAt: topic.completedAt })) : shared;
}
export function subjectExamChecklist(data: ReturnType<typeof readExamData>, subjectId: string) {
  const exams = (data.exams[subjectId] ?? []).filter(exam => !exam.deletedAt && !exam.archivedAt);
  return exams.some(exam => exam.topics) ? exams.flatMap(exam => examChecklist(exam, data.checklists[subjectId])) : data.checklists[subjectId] ?? [];
}
export function upcomingExams(subjects: Subject[], data: ReturnType<typeof readExamData>, today: string) {
  return subjects.flatMap((subject) => (data.exams[subject.id] ?? []).flatMap((exam) => {
    const days = Math.round((dateNumber(exam.date) - dateNumber(today)) / 86400000);
    if (!Number.isFinite(days) || days < 0 || exam.archivedAt || exam.deletedAt) return [];
    const checklist = examChecklist(exam, data.checklists[subject.id]);
    const done = checklist.filter((item) => item.done).length;
    return [{ ...exam, subjectId: subject.id, subjectName: subject.name, days, total: checklist.length, done, progress: checklist.length ? Math.round(done / checklist.length * 100) : 0, urgency: days === 0 ? "Today" : days <= 3 ? "Urgent" : days <= 7 ? "Soon" : "Normal" }];
  })).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.subjectName.localeCompare(b.subjectName) || a.id.localeCompare(b.id));
}
