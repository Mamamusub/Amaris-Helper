import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, Intl, require: (name) => load(path.join(path.dirname(file), `${name}.ts`)) });
  cache.set(file, mod.exports); return mod.exports;
}
const { semesterSummary, subjectSemester } = load("src/lib/semester-summary.ts");
const { readExamData, EXAM_KEY } = load("src/lib/exam-storage.ts");
const subjects = [{ id: "a", name: "Math" }, { id: "b", name: "Physics", semesterId: "2026/2" }];
const task = (id, extra = {}) => ({ id, subjectId: "a", assignedAgent: "a", title: id, status: "Planned", deadline: "2026-09-18", ...extra });
const data = (exams = {}, checklists = {}) => readExamData({ getItem: (key) => JSON.stringify(key === EXAM_KEY ? exams : checklists) });
test("semester scoping preserves legacy subjects and excludes deleted/unassigned tasks", () => {
  const s = semesterSummary(subjects, [task("open"), task("done", { status: "Done" }), task("deleted", { deletedAt: "yes" }), task("other", { subjectId: "b" }), task("no", { subjectId: undefined, assignedAgent: "secretary" })], data(), "2026/1", "2026-09-14");
  assert.equal(subjectSemester(subjects[0]), "2026/1");
  assert.equal(s.subjects, 1); assert.equal(s.open, 1); assert.equal(s.completedTasks, 1); assert.equal(s.timeline.length, 1);
  assert.equal(semesterSummary(subjects, [], data(), "2026/2", "2026-09-14").cards[0].subject.id, "b");
});
test("health uses exact percentages and inclusive exam/deadline boundaries", () => {
  const summarize = (date, done, tasks = []) => semesterSummary(subjects, tasks, data({ a: [{ id: "exam", date }] }, { a: Array.from({ length: 10 }, (_, i) => ({ text: String(i), done: i < done })) }), "2026/1", "2026-09-14").cards[0];
  assert.equal(summarize("2026-09-17", 6).health, "Urgent");
  assert.equal(summarize("2026-09-17", 7).health, "Good");
  assert.equal(summarize("2026-09-21", 4).health, "Attention");
  assert.equal(summarize("2026-09-21", 5).health, "Good");
  assert.equal(summarize("2026-09-22", 0).health, "Good");
  assert.equal(summarize("2026-09-22", 10, [task("late", { deadline: "2026-09-13" })]).health, "Urgent");
  assert.equal(summarize("2026-09-22", 10, [task("soon", { deadline: "2026-09-17" })]).health, "Attention");
});
test("weekly topics count known completion dates only; focus reuses history deduplication", () => {
  const record = { id: "session", startedAt: Date.parse("2026-09-14T10:00:00+07:00"), endedAt: Date.parse("2026-09-14T11:00:00+07:00"), elapsedMs: 3600000, snapshot: { subjectId: "a" } };
  const d = data({ a: [{ id: "past", date: "2026-09-14" }, { id: "next", date: "2026-09-18" }] }, { a: [{ text: "legacy", done: true }, { text: "this week", done: true, doneAt: "2026-09-14T10:00:00+07:00" }, { text: "before", done: true, doneAt: "2026-09-13T10:00:00+07:00" }, { text: "open", done: false }] });
  const s = semesterSummary(subjects, [task("one", { focusSessions: [record] }), task("duplicate", { focusSessions: [record] })], d, "2026/1", "2026-09-16");
  assert.equal(s.focusMs, 3600000); assert.equal(s.week.from, "2026-09-14"); assert.equal(s.week.to, "2026-09-20");
  assert.equal(s.week.completedTopics, 1); assert.equal(s.week.undatedTopics, 1); assert.equal(s.preparation, 75); assert.equal(s.week.exams, 2); assert.equal(s.exams, 1);
});
test("empty semesters return zero metrics and timeline combines exams and assignments in order", () => {
  const empty = semesterSummary([], [], data(), "2026/1", "2026-09-14");
  assert.equal(empty.preparation, 0); assert.equal(empty.focusMs, 0); assert.equal(empty.timeline.length, 0);
  const s = semesterSummary(subjects, [task("assignment", { deadline: "2026-09-15" })], data({ a: [{ id: "q", date: "2026-09-14", type: "Quiz" }, { id: "f", date: "2026-09-18", type: "Final" }] }), "2026/1", "2026-09-14");
  assert.equal(s.timeline.map((e) => e.label).join(","), "Quiz,Assignment,Final");
});
