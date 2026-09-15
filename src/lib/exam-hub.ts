import { dateNumber, EXAM_KEY, readExamData, type ExamInfo, type ExamMap, type ExamTopic } from "./exam-storage";
import type { Subject } from "./types";

export type HubExam = ExamInfo & { subjectId: string; subjectName: string; topics: ExamTopic[]; materials: NonNullable<ExamInfo["materials"]>; formulaNotes: NonNullable<ExamInfo["formulaNotes"]> };
export type ExamFilter = "Upcoming" | "Completed" | "All" | "Archived";
export function hubExams(data: ReturnType<typeof readExamData>, subjects: Subject[]): HubExam[] {
  return Object.entries(data.exams).flatMap(([subjectId, exams]) => exams.filter(exam => !exam.deletedAt).map(exam => ({ ...exam, subjectId, subjectName: subjects.find(subject => subject.id === subjectId)?.name ?? exam.subjectName ?? subjectId,
    color: exam.color || subjects.find(subject => subject.id === subjectId)?.color || "#879f58",
    topics: exam.topics ?? (data.checklists[subjectId] ?? []).map((topic, order) => ({ id: topic.id, examId: exam.id, title: topic.text, section: "", completed: topic.done, order, createdAt: "", updatedAt: "", completedAt: topic.doneAt })),
    materials: exam.materials ?? [], formulaNotes: exam.formulaNotes ?? [],
  })));
}
export const examRouteId = (exam: Pick<HubExam, "subjectId" | "id">) => `${encodeURIComponent(exam.subjectId)}~${encodeURIComponent(exam.id)}`;
export function readiness(topics: ExamTopic[]) { const done = topics.filter(topic => topic.completed).length; return { done, total: topics.length, percent: topics.length ? Math.round(done / topics.length * 100) : 0 }; }
export const daysUntilExam = (date: string, today: string) => Math.round((dateNumber(date) - dateNumber(today)) / 86400000);
export const examUrgency = (days: number) => days < 0 ? "Completed" : days <= 3 ? "Urgent" : days <= 7 ? "Soon" : "Normal";
export function selectExams(exams: HubExam[], today: string, filter: ExamFilter, query = "", subjectId = "") {
  const search = query.trim().toLocaleLowerCase();
  return exams.filter(exam => {
    const days = daysUntilExam(exam.date, today);
    return (!subjectId || exam.subjectId === subjectId) && `${exam.subjectName} ${exam.calendarName} ${exam.type}`.toLocaleLowerCase().includes(search) &&
      (filter === "Archived" ? !!exam.archivedAt : !exam.archivedAt && (filter === "All" || filter === "Upcoming" && days >= 0 || filter === "Completed" && days < 0));
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.id.localeCompare(b.id));
}
export function readinessOverview(exams: HubExam[]) {
  const active = exams.filter(exam => !exam.archivedAt);
  const groups = [...new Set(active.map(exam => exam.subjectId))].map(id => ({ id, name: active.find(exam => exam.subjectId === id)!.subjectName, ...readiness(active.filter(exam => exam.subjectId === id).flatMap(exam => exam.topics)) }));
  return { ...readiness(active.flatMap(exam => exam.topics)), groups };
}
export function recentExams(exams: HubExam[]) { return exams.filter(exam => exam.updatedAt && !exam.archivedAt).sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!)).slice(0, 5); }
export function calendarMonth(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`), count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: 42 }, (_, index) => { const day = index - first.getUTCDay() + 1; return day >= 1 && day <= count ? `${month}-${String(day).padStart(2, "0")}` : null; });
}
export function shiftExamMonth(month: string, amount: number) { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 7); }
export function safeMaterialUrl(value: string) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
export function validateExam(exam: Pick<HubExam, "subjectName" | "calendarName" | "date" | "time" | "endTime" | "targetScore">) {
  if (!exam.subjectName.trim() || !exam.calendarName.trim()) return "กรอกชื่อวิชาและชื่อข้อสอบ";
  if (!Number.isFinite(dateNumber(exam.date))) return "กรุณาระบุวันที่สอบที่ถูกต้อง";
  const validTime = (value: string) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(exam.time) || !validTime(exam.endTime ?? "")) return "เวลาไม่ถูกต้อง";
  if (exam.endTime && (!exam.time || exam.endTime <= exam.time)) return "เวลาสิ้นสุดต้องหลังเวลาเริ่มในวันเดียวกัน";
  if (exam.targetScore?.trim() && (!Number.isFinite(Number(exam.targetScore)) || Number(exam.targetScore) < 0 || Number(exam.targetScore) > 100)) return "คะแนนเป้าหมายต้องอยู่ระหว่าง 0–100%";
  return "";
}
export function saveHubExam(storage: Pick<Storage, "getItem" | "setItem">, next: HubExam, expected?: HubExam, now = new Date().toISOString()) {
  const raw = storage.getItem(EXAM_KEY);
  if (raw) { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("ข้อมูลสอบเดิมอ่านไม่ได้ กรุณาสำรองข้อมูลก่อนแก้ไข"); }
  const data = readExamData(storage), current = hubExams(data, []).find(exam => exam.subjectId === (expected?.subjectId ?? next.subjectId) && exam.id === next.id);
  const comparable = (exam: HubExam) => { const { subjectName: _subject, color: _color, ...rest } = exam; void _subject; void _color; return JSON.stringify(rest); };
  if (expected && (!current || comparable(current) !== comparable(expected))) throw new Error("ข้อสอบนี้เปลี่ยนจากอีกหน้าหรืออีกเครื่องแล้ว กรุณาปิดฟอร์มแล้วเปิดใหม่");
  if (!expected && current) throw new Error("ข้อสอบนี้มีอยู่แล้ว กรุณาโหลดข้อมูลล่าสุด");
  const saved = { ...next, createdAt: next.createdAt || now, updatedAt: now };
  const { subjectId, ...record } = saved;
  const map: ExamMap = { ...data.exams, [subjectId]: [...(data.exams[subjectId] ?? []).filter(exam => exam.id !== next.id), record] };
  if (expected && expected.subjectId !== subjectId) map[expected.subjectId] = (data.exams[expected.subjectId] ?? []).filter(exam => exam.id !== next.id);
  storage.setItem(EXAM_KEY, JSON.stringify(map));
  return saved;
}
