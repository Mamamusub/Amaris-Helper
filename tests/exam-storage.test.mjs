import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/exam-storage.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, Date });
const { readExamData, upcomingExams, EXAM_KEY } = mod.exports;
const read = (exams, checklist = {}) => readExamData({ getItem: (key) => JSON.stringify(key === EXAM_KEY ? exams : checklist) });
const subjects = [{ id: "math", name: "Math" }];
test("legacy single exams normalize without writing and keep stable IDs", () => {
  const data = read({ math: { date: "2026-09-14", time: "09:00" } });
  assert.equal(data.exams.math[0].type, "Midterm");
  assert.equal(data.exams.math[0].id, read({ math: { date: "2026-09-14" } }).exams.math[0].id);
  assert.equal(upcomingExams(subjects, data, "2026-09-14")[0].urgency, "Today");
});
test("malformed or unavailable storage is safe; valid siblings survive", () => {
  for (const raw of ["null", "[]", "invalid", "42"]) assert.equal(Object.keys(readExamData({ getItem: () => raw }).exams).length, 0);
  assert.equal(Object.keys(readExamData({ getItem: () => { throw Error("blocked"); } }).exams).length, 0);
  const data = read({ math: [null, false, { date: "2026-02-30" }, { date: "2026-09-15", time: "99:99" }] }, { math: [null, { text: "Read", done: "false" }, { text: "Practice", done: true }] });
  const items = upcomingExams(subjects, data, "2026-09-14");
  assert.equal(items.length, 1); assert.equal(items[0].time, ""); assert.equal(items[0].done, 1); assert.equal(items[0].total, 2); assert.equal(items[0].progress, 50);
});
test("upcoming exams sort by date then time and urgency respects 0/3/4/7/8 boundaries", () => {
  const data = read({ math: [8, 7, 4, 3, 0, -1].map((n) => ({ id: String(n), date: `2026-09-${14 + n}`, time: "10:00" })), removed: [{ date: "2026-09-14" }] });
  const items = upcomingExams(subjects, data, "2026-09-14");
  assert.equal(items.map((e) => e.urgency).join(","), "Today,Urgent,Soon,Soon,Normal");
  assert.equal(items.slice(0, 3).length, 3); assert.equal(items[0].total, 0);
  const sameDay = read({ math: [{ id: "late", date: "2026-09-14", time: "13:00" }, { id: "early", date: "2026-09-14", time: "08:00" }] });
  assert.equal(upcomingExams(subjects, sameDay, "2026-09-14")[0].id, "early");
  assert.equal(upcomingExams(subjects, data, "2027-01-01").length, 0);
});
