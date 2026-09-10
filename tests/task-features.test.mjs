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
