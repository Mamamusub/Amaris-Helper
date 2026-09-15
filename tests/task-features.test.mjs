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
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date, Intl, require: (name) => load(path.join(path.dirname(file), `${name}.ts`)) });
  cache.set(file, mod.exports); return mod.exports;
}
const { nextOccurrence, advanceRecurring, recurrenceToday, editRecurring } = load("src/lib/task-recurrence.ts");
const { elapsed, pause, finish, focusedToday } = load("src/lib/focus-timer.ts");
const rule = (frequency, anchor = "2026-01-31", extra = {}) => ({ frequency, anchor, weekdays: [1, 3], timeZone: "Asia/Bangkok", ...extra });
test("monthly 29–31 clamps to month end and returns to original anchor; leap year and year rollover", () => {
  for (const day of [29, 30, 31]) {
    const r = rule("monthly", `2026-01-${day}`);
    assert.equal(nextOccurrence(r, r.anchor), "2026-02-28");
    assert.equal(nextOccurrence(r, "2026-02-28"), `2026-03-${day}`);
  }
  assert.equal(nextOccurrence(rule("monthly", "2028-01-31"), "2028-01-31"), "2028-02-29");
  assert.equal(nextOccurrence(rule("monthly"), "2026-12-31"), "2027-01-31");
});
test("weekly multiple weekdays, daily rollover, inclusive end and timezone/DST boundaries", () => {
  assert.equal(nextOccurrence(rule("weekly"), "2026-09-07"), "2026-09-09");
  assert.equal(nextOccurrence(rule("weekly"), "2026-09-09"), "2026-09-14");
  assert.equal(nextOccurrence(rule("daily"), "2026-12-31"), "2027-01-01");
  assert.equal(nextOccurrence(rule("daily", "2026-09-09", { until: "2026-09-10" }), "2026-09-09"), "2026-09-10");
  assert.equal(nextOccurrence(rule("daily", "2026-09-09", { until: "2026-09-10" }), "2026-09-10"), null);
  assert.equal(recurrenceToday(rule("daily"), new Date("2026-09-09T17:00:00Z")), "2026-09-10");
  assert.equal(recurrenceToday(rule("daily", "2026-01-01", { timeZone: "America/New_York" }), new Date("2026-03-08T04:59:00Z")), "2026-03-07");
  assert.equal(recurrenceToday(rule("daily", "2026-01-01", { timeZone: "America/New_York" }), new Date("2026-03-08T07:01:00Z")), "2026-03-08");
});
const base = { id: "one", title: "Task", description: "Keep history", deadline: "2026-09-10", occurrenceDate: "2026-09-10", status: "Done", repeat: rule("daily", "2026-09-10"), subtasks: [{ id: "s", title: "Step", done: true }], sourceEventId: "google", focusSessions: [{ id: "old" }] };

test("Go KUS descriptions migrate once, including future templates, without changing other lessons", () => {
  const { migrateGoDescriptions, goLessons } = load("src/lib/recurring-tasks.ts");
  const original = { ...base, title: "สอนโกะที่ kus", nextTemplate: { description: "Old" } };
  const other = { ...base, id: "other", title: "สอนโกะที่อื่น" };
  const [updated, unchanged] = migrateGoDescriptions([original, other]);
  assert.equal(updated.description, "ที่ kus");
  assert.equal(updated.nextTemplate.description, "ที่ kus");
  assert.equal(updated.focusSessions, original.focusSessions);
  assert.equal(updated.deadline, original.deadline);
  assert.equal(unchanged, other);
  const edited = { ...updated, description: "Later edit" };
  assert.equal(migrateGoDescriptions([edited])[0], edited);
  assert.ok(goLessons([], "2026-09-11", true).every((task) => task.description === "ที่ kus"));
});

test("subject calendar counts completed tasks by day and subject, excluding deleted and duplicate tasks", () => {
  const { subjectMonth, shiftMonth } = load("src/lib/subject-counts.ts");
  const task = { ...base, subjectId: "go" };
  const tasks = [task, task, { ...task, id: "two" }, { ...task, id: "other", subjectId: "math" },
    { ...task, id: "pending", status: "Planned" }, { ...task, id: "deleted", deletedAt: "yes" },
    { ...task, id: "next", deadline: "2026-10-01" }, { ...task, id: "undated", deadline: "" }];
  const month = subjectMonth(tasks, "go", "2026-09");
  assert.equal(month.count, 2); assert.equal(month.days.length, 30); assert.equal(month.offset, 1);
  assert.equal(month.days[9].tasks.length, 2); assert.equal(month.days[8].tasks.length, 0);
  assert.equal(subjectMonth(tasks, "go", "2026-10").count, 1);
  assert.equal(subjectMonth(tasks.map((item) => ({ ...item, status: "Planned" })), "go", "2026-09").count, 0);
  assert.equal(subjectMonth([], "go", "2028-02").days.length, 29);
  assert.equal(subjectMonth([], "go", "bad").days.length, 0);
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});


test("completion creates exactly one stable round, resets checklist and Calendar binding, preserves history", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const result = advanceRecurring([base], now);
  assert.equal(result.length, 2);
  const next = result.find((item) => item.id !== base.id);
  assert.equal(next.id, "repeat:one:2026-09-11"); assert.equal(next.deadline, "2026-09-11");
  assert.equal(next.status, "Planned"); assert.equal(next.subtasks[0].done, false);
  assert.equal(next.sourceEventId, undefined); assert.equal(next.focusSessions.length, 0);
  assert.equal(result.find((item) => item.id === base.id).subtasks[0].done, true);
  assert.equal(advanceRecurring(result, now).length, 2);
  assert.equal(advanceRecurring([base, next], now).length, 2);
  assert.equal(advanceRecurring([base], now)[0].id, next.id);
});
test("missed rounds require explicit choice, skip creates one scheduled round and respects end date", () => {
  const now = new Date("2026-10-05T00:00:00Z");
  assert.equal(advanceRecurring([base], now).length, 1);
  const skipped = advanceRecurring([{ ...base, skipBefore: "2026-10-05" }], now);
  assert.equal(skipped.length, 2); assert.equal(skipped[0].deadline, "2026-10-05");
  const one = advanceRecurring([{ ...base, skipBefore: "2026-09-11" }], now);
  assert.equal(one.length, 2); assert.equal(one[0].deadline, "2026-09-11");
  assert.equal(advanceRecurring([{ ...base, skipBefore: "2026-10-05", repeat: { ...base.repeat, until: "2026-09-20" } }], now).length, 1);
});
test("this occurrence template override doesn't leak its title or checked subtasks", () => {
  const result = advanceRecurring([{ ...base, title: "Only this round", nextTemplate: { title: "Original", description: "Original notes", repeat: base.repeat, subtasks: [{ id: "original", title: "Original step", done: true }] } }], new Date("2026-09-10"));
  assert.equal(result[0].title, "Original"); assert.equal(result[0].subtasks[0].id, "original"); assert.equal(result[0].subtasks[0].done, false);
});
test("timer uses timestamps across pause, refresh, backgrounding, repeated end and deadline cap", () => {
  const start = { id: "session", taskId: "one", startedAt: 1000, runningSince: 1000, elapsedMs: 0, durationMs: 60000, note: "Next" };
  const paused = pause(start, 11000);
  assert.equal(elapsed(paused, 41000), 10000);
  const restored = JSON.parse(JSON.stringify(paused));
  const resumed = { ...restored, runningSince: 41000 };
  const ended = finish(resumed, 61000);
  assert.equal(ended.elapsedMs, 30000); assert.equal(ended.intervals.length, 2);
  assert.equal(finish(ended, 200000).elapsedMs, 30000);
  assert.equal(finish(ended, 200000).endedAt, 61000);
  const expired = finish(resumed, 200000);
  assert.equal(expired.elapsedMs, 60000); assert.equal(expired.endedAt, 91000);
  assert.equal(elapsed(start, 0), 0);
});
test("today focus splits midnight and excludes pauses", () => {
  const intervals = [{ start: Date.parse("2026-09-10T16:55:00Z"), end: Date.parse("2026-09-10T17:05:00Z") }, { start: Date.parse("2026-09-10T17:15:00Z"), end: Date.parse("2026-09-10T17:20:00Z") }];
  assert.equal(focusedToday(intervals, "2026-09-10"), 5 * 60000);
  assert.equal(focusedToday(intervals, "2026-09-11"), 10 * 60000);
});

test("editing scopes preserve completed history, occurrence-only templates and reschedule future dates", () => {
  const tasks = advanceRecurring([base], new Date("2026-09-10"));
  const only = editRecurring(tasks, { ...base, title: "One edit", priority: "High" }, "this");
  assert.equal(only.find((task) => task.id === base.id).title, "One edit");
  assert.equal(only.find((task) => task.id !== base.id).title, "Task");
  const changed = editRecurring(tasks, { ...base, title: "Series edit", repeat: rule("weekly", "2026-09-10", { weekdays: [1] }) }, "future");
  const future = changed.find((task) => task.id !== base.id);
  assert.equal(future.deadline, "2026-09-14");
  assert.equal(future.id, "repeat:one:2026-09-11", "rescheduling preserves Calendar identity");
  assert.equal(changed.find((task) => task.id === base.id).focusSessions[0].id, "old");
  const stopped = editRecurring(tasks, { ...base, repeat: undefined }, "future");
  assert.ok(stopped.find((task) => task.id !== base.id).deletedAt);
  assert.equal(stopped.find((task) => task.id === base.id).deletedAt, undefined);
});

const { focusHistory, summarizeFocus, focusRange, snapshotFocus, focusDuration, sessionClock, validRange } = load("src/lib/focus-history.ts");
test("assigning an unassigned focus task moves its history into the selected subject", () => {
  const subject = { id: "math", name: "Math", color: "#abc" };
  const record = { id: "unassigned", startedAt: Date.parse("2026-09-10"), elapsedMs: 60000, snapshot: { taskTitle: "Task", subjectId: null, subjectName: null } };
  const original = { ...base, repeat: undefined, focusSessions: [record] };
  const edited = editRecurring([original], { ...original, subjectId: subject.id });
  const summary = summarizeFocus(focusHistory(edited, [subject]), { from: "2026-09-10", to: "2026-09-10" }, [subject]);
  assert.equal(summary.groups[0].id, "math");
  assert.equal(summary.elapsedMs, 60000);
  const amended = { ...record, snapshot: { ...record.snapshot, subjectId: "math", subjectName: "Math" } };
  assert.equal(editRecurring([original], { ...original, focusSessions: [amended] })[0].focusSessions[0].snapshot.subjectId, "math");
});

test("deleting a subject detaches legacy and future references without deleting focus history", () => {
  const { detachSubject, migrateTasks } = load("src/lib/task-model.ts");
  const original = { ...base, subjectId: "math", assignedAgent: "math", nextTemplate: { subjectId: "math", assignedAgent: "math" } };
  const [updated] = detachSubject([original], "math");
  assert.equal(updated.subjectId, undefined);
  assert.equal(updated.nextTemplate.subjectId, undefined);
  assert.equal(updated.nextTemplate.assignedAgent, "researcher");
  assert.equal(migrateTasks([updated], [{ id: "math" }])[0].subjectId, undefined);
  assert.equal(updated.focusSessions, original.focusSessions);
});
const historyRecord = (id, start = "2026-09-10T02:00:00Z", extra = {}) => ({ id, startedAt: Date.parse(start), endedAt: Date.parse(start) + 1800000, elapsedMs: 1500000, note: "", ...extra });
test("Focus ranges start on Monday and handle month/year boundaries and invalid custom dates", () => {
  assert.equal(focusRange("week", "2026-09-13").from, "2026-09-07");
  assert.equal(focusRange("week", "2026-09-14").to, "2026-09-20");
  assert.equal(focusRange("week", "2027-01-01").from, "2026-12-28");
  assert.equal(focusRange("month", "2028-02-04").to, "2028-02-29");
  assert.equal(validRange({ from: "2026-02-30", to: "2026-03-01" }), false);
  assert.equal(validRange({ from: "2026-09-11", to: "2026-09-10" }), false);
});
test("Focus summary uses start day for the entire crossing-midnight round, deduplicates and retains deleted history", () => {
  const record = historyRecord("night", "2026-09-10T16:50:00Z");
  const rows = focusHistory([{ ...base, deletedAt: "yes", subjectId: "math", focusSessions: [record, record] }, { ...base, id: "copy", focusSessions: [record] }], [{ id: "math", name: "Math", color: "#abc" }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].day, "2026-09-10");
  assert.equal(summarizeFocus(rows, { from: "2026-09-10", to: "2026-09-10" }).elapsedMs, 1500000);
  assert.equal(summarizeFocus(rows, { from: "2026-09-11", to: "2026-09-11" }).count, 0);
  assert.ok(sessionClock(record).includes("2026-09-11"));
  assert.equal(rows[0].task.deletedAt, "yes");
});
test("historical snapshots survive renames, reassignment and subject deletion, with explicit unassigned snapshot", () => {
  const session = { id: "saved", startedAt: 1000, endedAt: 1801000, elapsedMs: 1500000, durationMs: 1500000, note: "", taskId: "one" };
  const saved = snapshotFocus(session, { ...base, subjectId: "math" }, [{ id: "math", name: "Original math", color: "#abc" }]);
  const rows = focusHistory([{ ...base, title: "Changed", subjectId: "physics", focusSessions: [saved] }], []);
  assert.equal(rows[0].title, "Task"); assert.equal(rows[0].subjectName, "Original math"); assert.equal(rows[0].subjectId, "math");
  assert.equal(rows[0].pausedMs, 300000); assert.equal(rows[0].record.outcome, "completed");
  const noSubject = snapshotFocus({ ...session, id: "none", elapsedMs: 20000 }, { ...base, subjectId: undefined }, []);
  const unassigned = focusHistory([{ ...base, subjectId: "physics", focusSessions: [noSubject] }], []);
  assert.equal(unassigned[0].subjectName, "ไม่ระบุวิชา"); assert.equal(noSubject.outcome, "ended-early");
});
test("legacy missing metadata stays unknown, only actual intervals establish pauses, totals sum milliseconds", () => {
  const records = [historyRecord("a", undefined, { elapsedMs: 31000 }), historyRecord("b", undefined, { elapsedMs: 31000 }), historyRecord("unknown", undefined, { startedAt: undefined, endedAt: undefined })];
  const rows = focusHistory([{ ...base, focusSessions: records }], []);
  assert.equal(rows.find((row) => row.record.id === "a").pausedMs, null);
  assert.equal(sessionClock(records[2]), "ไม่มีข้อมูลเวลาเริ่ม–สิ้นสุด");
  assert.equal(rows.find((row) => row.record.id === "unknown").day, null);
  const total = summarizeFocus(rows, { from: "2026-09-10", to: "2026-09-10" });
  assert.equal(total.elapsedMs, 62000); assert.equal(focusDuration(total.elapsedMs), "1 นาที");
  assert.equal(total.subjectCount, 0); assert.equal(total.count, 2);
  assert.equal(focusDuration(8100000), "2 ชม. 15 นาที");
  const withIntervals = historyRecord("spans", undefined, { intervals: [{ start: records[0].startedAt, end: records[0].startedAt + 1500000 }] });
  assert.equal(focusHistory([{ ...base, focusSessions: [withIntervals] }], [])[0].pausedMs, 300000);
});


test("stopwatch persists, counts beyond presets, excludes pauses and saves actual time", () => {
  const { timerComplete, timerDisplay } = load("src/lib/focus-timer.ts");
  const start = { id: "watch", taskId: "one", mode: "stopwatch", startedAt: 1000, runningSince: 1000, elapsedMs: 0, durationMs: 0, note: "" };
  assert.equal(timerDisplay(start, 1500), "00:00");
  assert.equal(timerComplete(start, 18001000), false);
  const restored = JSON.parse(JSON.stringify(start));
  const paused = pause(restored, 18001000);
  assert.equal(elapsed(paused, 18061000), 18000000);
  assert.equal(timerDisplay(paused, 18061000), "300:00");
  const resumed = { ...paused, runningSince: 18061000 };
  const ended = finish(resumed, 18121000);
  assert.equal(ended.elapsedMs, 18060000);
  assert.equal(ended.endedAt, 18121000);
  assert.equal(ended.intervals.length, 2);
  assert.deepEqual(finish(ended, 19000000), ended);
  const record = snapshotFocus(ended, { id: "one", title: "Study" }, []);
  assert.equal(record.elapsedMs, 18060000);
  assert.equal(record.pausedMs, 60000);
  assert.equal(record.durationMs, undefined);
  assert.equal(record.outcome, "completed");
  assert.equal(finish(paused, 18061000).elapsedMs, 18000000);
  const countdown = { ...start, mode: undefined, durationMs: 60000 };
  assert.equal(timerComplete(countdown, 61000), true);
  assert.equal(timerDisplay(countdown, 11000), "00:50");
});
