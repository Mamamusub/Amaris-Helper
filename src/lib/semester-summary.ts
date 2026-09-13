import type { Subject, Task } from "./types";
import { dateNumber, upcomingExams, type readExamData } from "./exam-storage";
import { dayKey, shiftDay } from "./calendar";
import { focusHistory, focusRange, summarizeFocus } from "./focus-history";

export const DEFAULT_SEMESTER = "2026/1";
export const subjectSemester = (subject: Subject) => subject.semesterId?.trim() || DEFAULT_SEMESTER;
export const semesterOptions = (subjects: Subject[]) => [...new Set([DEFAULT_SEMESTER, ...subjects.filter((s) => !s.deletedAt).map(subjectSemester)])].sort();
export function semesterSummary(subjects: Subject[], tasks: Task[], data: ReturnType<typeof readExamData>, semesterId: string, today: string) {
  const selected = subjects.filter((s) => !s.deletedAt && subjectSemester(s) === semesterId);
  const ids = new Set(selected.map((s) => s.id));
  const taskSubject = (task: Task) => task.subjectId || (ids.has(task.assignedAgent) ? task.assignedAgent : "");
  const assignments = tasks.filter((t) => !t.deletedAt && ids.has(taskSubject(t)));
  const open = assignments.filter((t) => t.status !== "Done");
  const exams = upcomingExams(selected, data, today);
  const week = focusRange("week", today);
  const inWeek = (date: string) => Number.isFinite(dateNumber(date)) && date >= week.from && date <= week.to;
  const topics = selected.flatMap((s) => data.checklists[s.id] ?? []);
  const done = topics.filter((t) => t.done).length;
  // Reuse Focus's start-day attribution, including its deduplication and snapshots.
  const history = focusHistory(tasks, subjects).filter((row) => ids.has(row.subjectId));
  const focusMs = summarizeFocus(history, week, selected).elapsedMs;
  const completedTopics = topics.filter((topic) => topic.done && topic.doneAt && Number.isFinite(Date.parse(topic.doneAt)) && inWeek(dayKey(new Date(topic.doneAt)))).length;
  const undatedTopics = topics.filter((topic) => topic.done && (!topic.doneAt || !Number.isFinite(Date.parse(topic.doneAt)))).length;
  const cards = selected.map((subject) => {
    const pending = open.filter((t) => taskSubject(t) === subject.id);
    const upcoming = exams.filter((e) => e.subjectId === subject.id);
    const checklist = data.checklists[subject.id] ?? [];
    const completed = checklist.filter((t) => t.done).length;
    const preparation = checklist.length ? completed / checklist.length * 100 : 0;
    const overdue = pending.filter((t) => Number.isFinite(dateNumber(t.deadline)) && t.deadline < today).length;
    const near = pending.some((t) => Number.isFinite(dateNumber(t.deadline)) && t.deadline >= today && t.deadline <= shiftDay(today, 3));
    const urgentExam = upcoming.some((e) => e.days <= 3) && preparation < 70;
    const soonExam = upcoming.some((e) => e.days <= 7) && preparation < 50;
    const health = overdue || urgentExam ? "Urgent" : near || soonExam ? "Attention" : "Good";
    const reason = overdue ? `${overdue} overdue assignments` : urgentExam ? "Exam ≤ 3 days · preparation < 70%" : soonExam ? "Exam ≤ 7 days · preparation < 50%" : near ? "Assignment due within 3 days" : "No immediate risks";
    return { subject, open: pending.length, exams: upcoming.length, nextExam: upcoming[0], completed, total: checklist.length, preparation: Math.round(preparation), health, reason };
  });
  const timeline = [
    ...open.filter((t) => Number.isFinite(dateNumber(t.deadline)) && t.deadline >= today).map((t) => ({ id: `task-${t.id}`, date: t.deadline, time: "", label: "Assignment", title: t.title, subjectId: taskSubject(t), subjectName: selected.find((s) => s.id === taskSubject(t))!.name })),
    ...exams.map((e) => ({ id: `exam-${e.subjectId}-${e.id}`, date: e.date, time: e.time, label: e.type, title: e.calendarName || `${e.subjectName} ${e.type}`, subjectId: e.subjectId, subjectName: e.subjectName })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.title.localeCompare(b.title));
  return { cards, timeline, subjects: selected.length, open: open.length, exams: exams.length, completedTasks: assignments.filter((t) => t.status === "Done").length, done, total: topics.length, preparation: topics.length ? Math.round(done / topics.length * 100) : 0, focusMs, week: { ...week, tasks: open.filter((t) => inWeek(t.deadline)).length, exams: upcomingExams(selected, data, week.from).filter((e) => inWeek(e.date)).length, completedTopics, undatedTopics } };
}
