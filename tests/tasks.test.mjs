import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);

function harness() {
  const storage = new Map();
  const cache = new Map();
  const hooks = new Map();
  let position = "", slot = 0;
  let visited = new Set();
  const react = {
    useMemo(calculate) { return calculate(); },
    useState(initial) {
      const key = `${position}:${slot++}`; visited.add(key);
      if (!hooks.has(key)) hooks.set(key, typeof initial === "function" ? initial() : initial);
      return [hooks.get(key), (value) => hooks.set(key, typeof value === "function" ? value(hooks.get(key)) : value)];
    },
    useEffect() {},
    useRef(value) { return react.useState({ current: value })[0]; },
    useSyncExternalStore(_, read) { return read(); },
    createContext(value) { const context = { value }; context.Provider = { context }; return context; },
    useContext(context) { return context.value; },
  };
  let failWrites = false;
  const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { if (failWrites) throw new Error("Quota exceeded"); storage.set(key, value); } };
  function load(file) {
    file = file.replaceAll("\\", "/");
    if (cache.has(file)) return cache.get(file);
    const source = fs.readFileSync(file, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod = { exports: {} };
    const stub = () => null;
    const importModule = (name) => {
      if (name.endsWith(".css")) return { default: {} };
      if (name === "react") return react;
      if (name.endsWith("account-boundary")) return { default: ({ children }) => children, useCloud: () => null, useCloudSnapshot: () => null, useAccountStorage: () => localStorage };
      if (/components\/(pipeline-view|integrations)/.test(name)) return { default: stub, AIStatus: stub, CalendarReturnNotice: stub, IntegrationSettings: stub, TaskIntegrations: stub };
      if (name.endsWith("use-pipeline")) return { usePipeline: () => ({ runs: [], start: stub, saveResponse: stub }) };
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? `src/${name.slice(2)}` : path.join(path.dirname(file), name);
        return load([`${base}.ts`, `${base}.tsx`].find((file) => fs.existsSync(file)));
      }
      return require(name);
    };
    vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: importModule, window: { localStorage, confirm: () => true }, localStorage, document: {activeElement:{focus() {}}}, crypto: { randomUUID }, Date, Intl, URL, setInterval, clearInterval, AbortSignal, console });
    cache.set(file, mod.exports);
    return mod.exports;
  }
  const Shell = load("src/components/app-shell.tsx").default;
  function walk(element, at = "root") {
    if (element == null || typeof element === "boolean") return null;
    if (Array.isArray(element)) return element.map((item, index) => walk(item, `${at}/${item?.key ?? index}`));
    if (typeof element !== "object") return element;
    const { type, props, key } = element;
    at += `/${key ?? (typeof type === "function" ? type.name : String(type))}`;
    if (type?.context) { type.context.value = props.value; return walk(props.children, at); }
    if (typeof type === "function") { position = at; slot = 0; return walk(type(props), at); }
    return { type, props, children: walk(props.children, at) };
  }
  let tree;
  const render = () => { visited = new Set(); tree = walk({ type: Shell, props: {} }); for (const key of hooks.keys()) if (!visited.has(key)) hooks.delete(key); return tree; };
  const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.children) : node ?? "";
  const findAll = (predicate, node = tree) => {
    if (Array.isArray(node)) return node.flatMap((child) => findAll(predicate, child));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...findAll(predicate, node.children)];
  };
  const click = (label, node = tree) => { const button = findAll((n) => n.type === "button" && (text(n).trim() === label || (n.props.className?.includes("nav-item") && text(n).trim().endsWith(label))), node)[0]; assert.ok(button, `button ${label}`); button.props.onClick(); render(); };
  const field = (label, value) => { const group = findAll((n) => n.type === "label" && text(n).startsWith(label), findAll(n => n.type === "form").at(-1) ?? tree)[0]; assert.ok(group, label); const input = findAll((n) => ["input", "textarea", "select"].includes(n.type), group)[0]; input.props.onChange({ target: { value, checked: value } }); render(); };
  const save = () => { const form = findAll((n) => n.type === "form" && n.props.className === "panel task-editor")[0]; form.props.onSubmit({ preventDefault() {} }); render(); };
  return { failWrites() { failWrites = true; }, storage, load, render, click, field, save, findAll, text, refresh() { hooks.clear(); render(); } };
}

test("Study subject focus opens a linked timer, reuses its task after reload, and handles failed storage", () => {
  const h = harness();
  h.storage.set("agent-helper.subjects", JSON.stringify([{ id: "math", name: "Math", context: "", color: "#abc", nextEvent: "" }]));
  h.storage.set("agent-helper.tasks", "[]");
  const openSubject = () => { h.click("Study"); h.findAll((n) => n.props.className === "subject-card")[0].props.onClick(); h.render(); };
  h.render(); openSubject(); h.click("◷ Focus วิชานี้");
  let saved = JSON.parse(h.storage.get("agent-helper.tasks"));
  assert.equal(saved.length, 1); assert.equal(saved[0].subjectId, "math");
  assert.ok(h.text(h.findAll((n) => n.props.className === "focus-panel")[0]).includes("ทบทวน Math"));
  assert.ok(h.findAll((n) => n.type === "button" && h.text(n) === "เริ่มโฟกัส").length);
  h.refresh(); openSubject(); h.click("◷ Focus วิชานี้");
  assert.equal(JSON.parse(h.storage.get("agent-helper.tasks")).length, 1);
  saved[0].status = "Done"; h.storage.set("agent-helper.tasks", JSON.stringify(saved));
  h.refresh(); openSubject(); h.failWrites(); h.click("◷ Focus วิชานี้");
  assert.equal(h.findAll((n) => n.props.className === "focus-panel").length, 0);
  assert.equal(JSON.parse(h.storage.get("agent-helper.tasks")).length, 1);
  assert.ok(h.text(h.render()).includes("Could not save tasks"));
});

test("Study subject color edit propagates to linked tasks", () => {
  const h = harness();
  h.storage.set("agent-helper.subjects", JSON.stringify([{ id: "math", name: "Math", context: "Algebra", color: "#abc", nextEvent: "" }]));
  h.storage.set("agent-helper.tasks", JSON.stringify([{ id: "math-task", title: "Practice", subjectId: "math", color: "#abc", description: "", team: "Study", assignedAgent: "math", status: "Planned", priority: "Medium", deadline: "", createdAt: "old", updatedAt: "old" }]));
  h.render(); h.click("Study");
  h.findAll((n) => n.props.className === "subject-card")[0].props.onClick(); h.render();
  h.click("แก้ไขวิชา"); h.field("สีวิชา", "#123456");
  h.findAll((n) => n.type === "form").at(-1).props.onSubmit({ preventDefault() {} }); h.render();
  assert.equal(JSON.parse(h.storage.get("agent-helper.subjects"))[0].color, "#123456");
  assert.equal(JSON.parse(h.storage.get("agent-helper.tasks"))[0].color, "#123456");
});

test("Minimized Focus displays its subject and timer and reopens without replacing the session", () => {
  const h = harness();
  h.storage.set("agent-helper.subjects", JSON.stringify([{ id: "math", name: "Math", context: "", color: "#abc", nextEvent: "" }]));
  h.storage.set("agent-helper.tasks", JSON.stringify([{ id: "review", title: "Review chapter 1", subjectId: "math", team: "Study", assignedAgent: "math", status: "Planned", priority: "Medium", deadline: "", createdAt: "old", updatedAt: "old" }]));
  const session = JSON.stringify({ id: "session-1", taskId: "review", startedAt: Date.now(), runningSince: null, elapsedMs: 60000, durationMs: 1500000, note: "" });
  h.storage.set("agent-helper.focus-session", session);
  h.render();
  const mini = () => h.findAll((n) => n.props.className === "focus-mini")[0];
  assert.ok(h.text(mini()).includes("Math"));
  assert.ok(h.text(mini()).includes("Review chapter 1"));
  assert.ok(h.text(mini()).includes("24:00"));
  mini().props.onClick(); h.render();
  assert.equal(mini(), undefined);
  assert.ok(h.findAll((n) => n.props.className === "focus-panel").length);
  h.click("− ย่อหน้าต่าง");
  assert.ok(mini());
  h.click("Study"); assert.ok(mini());
  assert.equal(h.storage.get("agent-helper.focus-session"), session);
});

test("Study Count shows subject history, selected-day tasks and previous months", () => {
  const h = harness();
  const month = h.load("src/lib/calendar.ts").dayKey(new Date()).slice(0, 7);
  h.storage.set("agent-helper.subjects", JSON.stringify([{ id: "go", name: "Go", context: "", color: "#abc", nextEvent: "" }]));
  h.storage.set("agent-helper.tasks", JSON.stringify([{ id: "lesson", title: "Go lesson", subjectId: "go", assignedAgent: "researcher", team: "Study", status: "Done", priority: "Low", deadline: `${month}-03`, createdAt: "old", updatedAt: "old" }]));
  h.render(); h.click("Study");
  h.findAll((n) => n.props.className === "subject-card")[0].props.onClick(); h.render();
  const count = () => h.findAll((n) => n.props.className === "subject-count")[0];
  assert.ok(count());
  assert.equal(h.findAll((n) => n.type === "strong", h.findAll((n) => n.props.className === "subject-count-total")[0]).map(h.text).join(""), "1");
  h.findAll((n) => n.props["aria-label"] === `${month}-03 · 1 ครั้ง`)[0].props.onClick(); h.render();
  assert.ok(h.text(h.findAll((n) => n.props.className === "subject-count-detail")[0]).includes("Go lesson"));
  h.findAll((n) => n.props["aria-label"] === "เดือนก่อนหน้า")[0].props.onClick(); h.render();
  assert.ok(h.text(count()).includes("ยังไม่มีประวัติ"));
  h.findAll((n) => n.props["aria-label"] === "เดือนถัดไป")[0].props.onClick(); h.render();
  h.click("Reopen");
  assert.ok(h.text(count()).includes("ยังไม่มีประวัติ"));
  h.click("Task1"); assert.equal(h.findAll((n) => n.props.className === "subject-count" || n.props.className === "panel task-counts").length, 0);
});

test("shared task lifecycle across Study, Tasks, Calendar, Today and refresh", () => {
  const h = harness();
  const { dayKey, shiftDay } = h.load("src/lib/calendar.ts");
  const today = dayKey(new Date());
  const original = { id: "legacy", title: "Existing user task", description: "Keep me", assignedAgent: "secretary", team: "Career", status: "Planned", priority: "Low", deadline: "", createdAt: "old", updatedAt: "old" };
  h.storage.set("agent-helper.tasks", JSON.stringify([original]));
  h.storage.set("agent-helper.subjects", JSON.stringify([{ id: "ds", name: "Data Structures", context: "Study", color: "#abc", nextEvent: "" }]));
  h.render(); h.click("Study");
  const subject = h.findAll((n) => n.type === "button" && n.props.className === "subject-card")[0]; subject.props.onClick(); h.render();
  h.click("+ New task"); h.field("Title", "Submit DS lab"); h.field("Description", "Lab details"); h.field("Due date", today); h.save();
  const read = () => JSON.parse(h.storage.get("agent-helper.tasks"));
  const id = read().find((task) => task.title === "Submit DS lab").id;
  assert.equal(read()[0].subjectId, "ds");
  assert.deepEqual(JSON.parse(h.storage.get("agent-helper.tasks.legacy-backup")), [original]);
  h.click("Task2"); h.click("All Tasks2");
  h.click("Edit"); h.field("Title", "Updated lab"); h.field("Priority", "High"); h.save();
  h.click("Calendar"); assert.ok(h.findAll((n) => n.type === "h4" && h.text(n) === "Updated lab").length === 1);
  h.click("Edit"); h.field("Description", "Updated from Calendar"); h.save();
  h.click("Today"); assert.ok(h.findAll((n) => n.type === "strong" && h.text(n) === "Updated lab").length === 1);
  h.click("☆ Focus"); h.click("Edit"); h.field("Due date", shiftDay(today, -1)); h.save();
  assert.equal(h.load("src/lib/task-model.ts").todayTasks(read(), today).length, 1);
  h.click("Complete"); assert.equal(h.load("src/lib/task-model.ts").todayTasks(read(), today).length, 0);
  h.click("Task1"); h.click("All Tasks2"); h.click("Reopen"); h.click("Delete");
  assert.equal(read().find((task) => task.id === id).deletedAt != null, true);
  h.refresh(); h.click("Undo"); assert.equal(read().find((task) => task.id === id).deletedAt, undefined);
  h.click("Task2"); h.click("All Tasks2"); h.click("Edit"); h.field("Due date", ""); h.save();
  h.click("Calendar"); assert.equal(h.findAll((n) => n.type === "h4" && h.text(n) === "Updated lab").length, 0);
  h.click("Today"); assert.equal(h.findAll((n) => n.type === "strong" && h.text(n) === "Updated lab").length, 1);
  h.click("Data Structures ↗"); assert.equal(h.findAll((n) => n.type === "strong" && h.text(n) === "Updated lab").length, 1);
  h.refresh(); assert.deepEqual(read().find((task) => task.id === "legacy"), original);
  assert.equal(read().filter((task) => task.id === id).length, 1);
});

test("Bangkok date boundaries and additive, idempotent legacy migration", () => {
  const h = harness(); const { dayKey, shiftDay } = h.load("src/lib/calendar.ts");
  assert.equal(dayKey(new Date("2026-09-08T17:00:00Z")), "2026-09-09");
  assert.equal(dayKey(new Date("2026-09-08T16:59:59Z")), "2026-09-08");
  assert.equal(shiftDay("2028-03-01", -1), "2028-02-29");
  const { migrateTasks, todayTasks } = h.load("src/lib/task-model.ts");
  const legacy = [{ id: "a", assignedAgent: "ds", deadline: "", status: "Planned", unknown: "preserved" }];
  const migrated = migrateTasks(legacy, [{ id: "ds" }]);
  assert.equal(migrated[0].subjectId, "ds"); assert.equal(migrated[0].unknown, "preserved"); assert.equal(legacy[0].subjectId, undefined);
  assert.deepEqual(migrateTasks(migrated, [{ id: "ds" }]), migrated);
  assert.equal(todayTasks(migrated, "2026-09-09").length, 0);
});

test("imported calendar tasks never duplicate or resurrect after changes", () => {
  const h = harness(); const { calendarEntries } = h.load("src/lib/calendar.ts");
  const event = { id: "event", title: "Old title", start: "2026-09-09", end: "2026-09-10", allDay: true };
  const task = { id: "stable", sourceEventId: "event", title: "New title", deadline: "2026-09-12", status: "Planned" };
  let entries = calendarEntries([task], [event]);
  assert.equal(entries.length, 1); assert.equal(entries[0].title, "New title"); assert.equal(entries[0].first, "2026-09-12");
  assert.equal(calendarEntries([{ ...task, deadline: "" }], [event]).length, 0);
  assert.equal(calendarEntries([{ ...task, deletedAt: "now" }], [event]).length, 0);
  entries = calendarEntries([{ ...task, status: "Done" }], [event]); assert.equal(entries.length, 1); assert.equal(entries[0].done, true);
  assert.equal(calendarEntries([task], []).length, 1);
});

for (const view of ["Today", "Tasks", "Calendar", "Study"]) {
  test(`create, edit, complete, delete and Undo through ${view} controls`, () => {
    const h = harness(); h.storage.set("agent-helper.tasks", "[]"); h.storage.set("agent-helper.subjects", "[]"); h.render();
    if (view !== "Today") h.click(view === "Tasks" ? "Task0" : view);
    if (view === "Study") { h.findAll((n) => n.type === "input" && n.props["aria-label"] === "New subject name")[0].props.onChange({ target: { value: "New subject" } }); h.render(); h.findAll((n) => n.type === "form" && n.props.className === "add-subject")[0].props.onSubmit({ preventDefault() {} }); h.render(); h.findAll((n) => n.type === "button" && n.props.className === "subject-card")[0].props.onClick(); h.render(); }
    h.click(view === "Today" ? "+" : "+ New task"); h.field("Title", `${view} created`); h.save();
    if (view === "Tasks") h.click("All Tasks1");
    const read = () => JSON.parse(h.storage.get("agent-helper.tasks"));
    assert.equal(read().length, 1);
    const id = read()[0].id;
    h.click("Edit"); h.field("Description", "Edited here"); h.field("Priority", "Low"); h.save();
    assert.equal(read()[0].description, "Edited here"); assert.equal(read()[0].id, id);
    h.click("Delete"); assert.ok(read()[0].deletedAt); h.click("Undo"); assert.equal(read()[0].deletedAt, undefined);
    h.click("Complete"); assert.equal(read()[0].status, "Done");
    h.refresh(); assert.equal(read()[0].status, "Done");
  });
}

test("failed persistence keeps the previous task state and editor open", () => {
  const h = harness(); h.storage.set("agent-helper.tasks", "[]"); h.storage.set("agent-helper.subjects", "[]"); h.render();
  h.click("+"); h.field("Title", "Cannot save"); h.failWrites(); h.save();
  assert.equal(h.storage.get("agent-helper.tasks"), "[]");
  assert.equal(h.findAll((n) => n.props.role === "alert").length, 1);
  assert.equal(h.findAll((n) => n.props["aria-label"] === "Edit task").length, 1);
});

test("Today selects the nearest three unfinished deadlines and retains explicit focus without duplicates", () => {
  const h = harness(); const { todayTasks } = h.load("src/lib/task-model.ts");
  const task = (id, deadline, extra = {}) => ({ id, deadline, status: "Planned", ...extra });
  const tasks = [task("later", "2026-09-15"), task("overdue", "2026-09-08"), task("tomorrow", "2026-09-10", { focused: true }), task("today", "2026-09-09"), task("next", "2026-09-11"), task("done", "2026-09-09", { status: "Done" }), task("deleted", "2026-09-09", { deletedAt: "now" }), task("undated", ""), task("manual", "", { focused: true })];
  assert.deepEqual(Array.from(todayTasks(tasks, "2026-09-09"), (task) => task.id), ["today", "tomorrow", "next", "manual"]);
  assert.deepEqual(Array.from(todayTasks(tasks.map((task) => task.id === "today" ? { ...task, status: "Done" } : task), "2026-09-09"), (task) => task.id), ["tomorrow", "next", "later", "manual"]);
});

test("Tasks opens This week and Focus uses the same deadline for imported and manual tasks", () => {
  const h = harness();
  const { dayKey, shiftDay } = h.load("src/lib/calendar.ts");
  const today = dayKey(new Date());
  const base = { description: "", team: "Study", assignedAgent: "researcher", status: "Planned", priority: "Medium", createdAt: today, updatedAt: today };
  h.storage.set("agent-helper.tasks", JSON.stringify([{ ...base, id: "imported", title: "Calendar assignment", sourceEventId: "google-event", deadline: today }, { ...base, id: "manual", title: "Later assignment", deadline: shiftDay(today, 1) }]));
  h.storage.set("agent-helper.subjects", "[]"); h.render();
  assert.equal(h.findAll((n) => n.type === "h3" && h.text(n) === "Calendar assignment").length, 1);
  h.click("Task2");
  assert.ok(h.findAll((n) => n.props.className === "tab active" && h.text(n).startsWith("This week")).length);
  h.click("Today"); h.click("Task2");
  assert.ok(h.findAll((n) => n.props.className === "tab active" && h.text(n).startsWith("This week")).length);
});

test("Focus includes unassigned Calendar deadlines but suppresses imported, completed and deleted originals", () => {
  const h = harness(); const { focusCandidates } = h.load("src/lib/task-model.ts");
  const event = { id: "calendar-event", title: "Upcoming lab", description: "Lab", allDay: true, start: "2026-09-10", end: "2026-09-11" };
  const shown = focusCandidates([], [event, event], "2026-09-09");
  assert.equal(shown.length, 1); assert.equal(shown[0].title, "Upcoming lab"); assert.equal(shown[0].deadline, "2026-09-10");
  assert.equal(focusCandidates([{ ...shown[0], status: "Done" }], [event], "2026-09-09").length, 0);
  assert.equal(focusCandidates([{ ...shown[0], deletedAt: "now" }], [event], "2026-09-09").length, 0);
  const updated = focusCandidates([{ ...shown[0], title: "Edited task", deadline: "2026-09-12" }], [event], "2026-09-09");
  assert.equal(updated.length, 1); assert.equal(updated[0].title, "Edited task"); assert.equal(updated[0].deadline, "2026-09-12");
});

test("weekly Go lessons use actual Thursdays, cross year boundaries and never recreate edited/deleted occurrences", () => {
  const h = harness(); const { goLessons } = h.load("src/lib/recurring-tasks.ts");
  assert.equal(goLessons([], "2026-09-09").length, 0);
  const lessons = goLessons([], "2026-09-09", true);
  assert.equal(lessons.length, 12); assert.equal(lessons[0].deadline, "2026-09-03");
  assert.ok(lessons[0].title.includes("(2026/9/3)"));
  assert.ok(lessons.every((task) => new Date(`${task.deadline}T12:00:00Z`).getUTCDay() === 4));
  const saved = lessons.map((task, index) => index === 0 ? { ...task, deletedAt: "now" } : task);
  assert.equal(goLessons(saved, "2026-09-09").length, 0);
  const yearEnd = goLessons([], "2026-12-31", true);
  assert.equal(yearEnd[0].deadline, "2026-12-03"); assert.equal(yearEnd[5].deadline, "2027-01-07");
  assert.ok(yearEnd[5].title.includes("(2027/1/7)"));
});

test("subtasks support Enter, rename, completion, delete/Undo and persist progress after refresh", () => {
  const h = harness(); h.storage.set("agent-helper.tasks", "[]"); h.storage.set("agent-helper.subjects", "[]"); h.render();
  h.click("+"); h.field("Title", "Checklist test");
  const input = () => h.findAll((n) => n.type === "input" && n.props["aria-label"] === "เพิ่มงานย่อย")[0];
  for (const title of ["First", "Second"]) {
    input().props.onChange({ target: { value: title } }); h.render();
    input().props.onKeyDown({ key: "Enter", nativeEvent: { isComposing: false }, preventDefault() {} }); h.render();
  }
  const names = () => h.findAll((n) => n.type === "input" && n.props["aria-label"] === "ชื่องานย่อย");
  names()[0].props.onChange({ target: { value: "Renamed" } }); h.render();
  h.findAll((n) => n.props["aria-label"] === "เสร็จ: Renamed")[0].props.onChange({ target: { checked: true } }); h.render();
  h.findAll((n) => n.type === "button" && n.props["aria-label"] === "ลบ Second")[0].props.onClick(); h.render();
  h.click("ย้อนกลับ"); h.save(); h.refresh();
  const saved = JSON.parse(h.storage.get("agent-helper.tasks"))[0];
  assert.equal(saved.subtasks.length, 2); assert.equal(saved.subtasks[0].title, "Renamed"); assert.equal(saved.status, "Planned");
  assert.equal(h.findAll((n) => n.type === "progress" && n.props.max === 2 && n.props.value === 1).length, 1);
});

test("recurrence completion through shared controls is persisted once and series deletion supports Undo", () => {
  const h = harness(); const { dayKey, shiftDay } = h.load("src/lib/calendar.ts"); const today = dayKey(new Date());
  h.storage.set("agent-helper.tasks", JSON.stringify([{ id: "series", title: "Repeat", description: "", team: "Study", assignedAgent: "researcher", deadline: today, status: "Planned", priority: "Medium", createdAt: today, updatedAt: today, repeat: { frequency: "daily", weekdays: [], anchor: today, timeZone: "Asia/Bangkok" } }]));
  h.storage.set("agent-helper.subjects", "[]"); h.render(); h.click("Complete"); h.refresh();
  const read = () => JSON.parse(h.storage.get("agent-helper.tasks"));
  assert.equal(read().length, 2); assert.equal(read().find((task) => task.id !== "series").deadline, shiftDay(today, 1));
  h.click("Delete"); h.click("รอบนี้และรอบถัดไป");
  assert.equal(read().filter((task) => task.deletedAt).length, 1);
  h.click("Undo"); assert.equal(read().filter((task) => task.deletedAt).length, 0);
  assert.equal(read().find((task) => task.id !== "series").recurrenceHandled, false);
});

test("Focus navigation defaults to week, expands multiple subjects, paginates and opens the original task", () => {
  const h = harness(); const { dayKey } = h.load("src/lib/calendar.ts"); const day = dayKey(new Date());
  const startedAt = Date.parse(`${day}T02:00:00Z`);
  const records = Array.from({ length: 22 }, (_, index) => ({ id: `session-${index}`, startedAt: startedAt + index * 60000, endedAt: startedAt + index * 60000 + 30000, elapsedMs: 30000, note: "" }));
  const task = { id: "history-task", title: "Original focus task", description: "", deadline: day, status: "Planned", priority: "Medium", team: "Study", assignedAgent: "researcher", subjectId: "math", focusSessions: records };
  h.storage.set("agent-helper.tasks", JSON.stringify([task, { ...task, id: "deleted-history", title: "Deleted task history", deletedAt: "yes", subjectId: undefined, focusSessions: [{ ...records[0], id: "deleted-session" }] }]));
  h.storage.set("agent-helper.subjects", JSON.stringify([{ id: "math", name: "Math", color: "#abc" }]));
  h.render(); h.click("Focus");
  assert.equal(h.findAll((n) => n.type === "select" && n.props.value === "week").length, 1);
  const toggle = (index) => { h.findAll((n) => n.props["aria-controls"] === `focus-subject-${index}`)[0].props.onClick(); h.render(); };
  toggle(0); toggle(1);
  assert.equal(h.findAll((n) => n.props["aria-expanded"] === true).length, 2);
  assert.equal(h.findAll((n) => n.type === "article" && n.props.className === "focus-history-row").length, 21);
  h.click("โหลดเพิ่มเติม · เหลือ 2 รอบ");
  assert.equal(h.findAll((n) => n.type === "article" && n.props.className === "focus-history-row").length, 23);
  assert.equal(h.findAll((n) => n.type === "button" && h.text(n).includes("Deleted task history")).length, 0);
  h.findAll((n) => n.type === "button" && n.props.className === "focus-task-link")[0].props.onClick(); h.render();
  assert.equal(h.findAll((n) => n.type === "input" && n.props.value === task.title).length, 1);
  assert.equal(JSON.parse(h.storage.get("agent-helper.tasks"))[0].focusSessions.length, 22, "viewing history doesn't write sessions");
  h.findAll((n) => n.props["aria-label"] === "Close task editor")[0].props.onClick(); h.render();
  h.field("ช่วงเวลา", "custom"); h.field("ตั้งแต่", "2099-01-01"); h.field("ถึง", "2099-01-02");
  assert.equal(h.findAll((n) => n.type === "h3" && h.text(n) === "ไม่มีรอบโฟกัสในช่วงนี้").length, 1);
  assert.equal(h.findAll((n) => n.props.className === "focus-subject-toggle").length, 0);
  h.refresh(); h.click("Focus");
  assert.equal(JSON.parse(h.storage.get("agent-helper.tasks"))[0].focusSessions.length, 22);
});

test("Career forms persist, open read-first, link resumes and create only one task", () => {
 const h=harness(); h.render(); h.click("Career"); h.click("Applications"); h.click("+ Add internship");
 const open = () => {h.findAll(n=>n.props["aria-label"] === "Open Internship test / Backend intern")[0].props.onClick();h.render();};
 h.field("Company","Internship test"); h.field("Position","Backend intern"); h.field("Next action","Prepare application"); h.field("Resume version","resume-0");
 const submit = () => {h.findAll(n=>n.type === "form")[0].props.onSubmit({preventDefault(){}});h.render();};
 submit(); open(); assert.equal(h.findAll(n=>n.type === "form").length,0);
 h.click("Edit application"); h.field("Application link","javascript:alert(1)"); submit(); assert.equal(h.findAll(n=>n.type === "form").length,1);
 h.field("Application link","https://example.com/jobs"); submit(); open();
 h.click("Create practice / next action Task"); h.click("Create practice / next action Task");
 const stored = JSON.parse(h.storage.get("agent-helper.tasks")); assert.equal(stored.filter(t=>t.title === "Prepare application").length,1);
 h.refresh(); h.click("Career"); h.click("Applications"); open(); h.click("Edit application");
 assert.equal(h.findAll(n=>n.type === "select" && n.props.value === "resume-0", h.findAll(n=>n.type === "form")[0]).length,1);
 h.click("Cancel"); open(); h.click("Delete application"); h.click("Delete");
 assert.equal(JSON.parse(h.storage.get("amaris.career.applications")).some(app=>app.company === "Internship test"), false);
 assert.equal(JSON.parse(h.storage.get("agent-helper.tasks")).filter(t=>t.title === "Prepare application").length, 1);
});

test("Internship tracker filters, sorts, groups periods and edits shared application records in all views", () => {
 const h = harness();
 const base = {company:"Same company",status:"Interested",deadline:"2026-10-07",link:"",notes:"Existing notes",location:"Bangkok",resumeId:"resume-0",nextAction:"Prepare resume"};
 h.storage.set("amaris.career.applications", JSON.stringify([
   {...base,id:"backend",position:"Backend intern",field:"Software",workType:"Remote",duration:"3 months",internshipPeriod:"Apr–Jun 2027",periodMatch:"Match",interestLevel:"High",applicationOpen:"Open",nextActionDate:"2026-10-05"},
   {...base,id:"security",position:"Security intern",field:"Security",location:"Chiang Mai",internshipPeriod:"November 2026",status:"Online Test",periodMatch:"Partial match",interestLevel:"Medium",deadline:"2026-10-04",nextActionDate:"2026-10-08"},
 ]));
 h.render(); h.click("Career"); h.click("Applications");
 const cards = () => h.findAll(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open Same company /"));
 assert.equal(cards().length, 2); assert.equal(cards()[0].props["aria-label"], "Open Same company / Security intern");
 h.field("Sort", "next"); assert.equal(cards()[0].props["aria-label"], "Open Same company / Backend intern");
 for (const [label,value] of [["Field","Software"],["Location","Bangkok"],["Status","Interested"],["Internship period","Apr–Jun 2027"],["Period match","Match"],["Interest level","High"]]) {
   h.field(label, value); assert.equal(cards().length, 1); assert.equal(cards()[0].props["aria-label"], "Open Same company / Backend intern"); h.click("Clear filters");
 }
 h.field("Field", "Software"); h.field("Location", "Chiang Mai"); assert.equal(cards().length, 0); assert.ok(h.text(h.render()).includes("No internships match")); h.click("Clear filters");
 h.field("Group by internship period", true); assert.ok(h.findAll(n=>n.type === "h4" && h.text(n) === "November 2026").length);
 h.click("Table"); assert.equal(h.findAll(n=>n.type === "table").length, 2);
 h.click("Kanban"); assert.equal(h.findAll(n=>n.props["aria-label"] === "Online Test applications").length, 2);
 const select = h.findAll(n=>n.type === "select" && n.props["aria-label"] === "Same company / Backend intern status")[0];
 select.props.onChange({target:{value:"Interview"}}); h.render();
 assert.equal(JSON.parse(h.storage.get("amaris.career.applications"))[0].status, "Interview");
 cards().find(n=>n.props["aria-label"] === "Open Same company / Backend intern").props.onClick(); h.render();
 assert.equal(h.findAll(n=>n.props.role === "dialog").length, 1); assert.equal(h.findAll(n=>n.type === "form").length, 0);
 h.click("Edit application"); h.field("Contact", "recruiter@example.com"); h.field("Interest level", "Low");
 h.findAll(n=>n.type === "form")[0].props.onSubmit({preventDefault(){}}); h.render();
 h.refresh(); h.click("Career"); h.click("Applications");
 const saved = JSON.parse(h.storage.get("amaris.career.applications"));
 assert.equal(saved.length, 2); assert.equal(saved[0].contact, "recruiter@example.com"); assert.equal(saved[0].interestLevel, "Low"); assert.equal(saved[0].notes, "Existing notes"); assert.equal(saved[0].resumeId, "resume-0");
 h.failWrites(); h.findAll(n=>n.type === "select" && n.props["aria-label"] === "Same company / Backend intern status")[0].props.onChange({target:{value:"Offer"}}); h.render();
 assert.equal(JSON.parse(h.storage.get("amaris.career.applications"))[0].status, "Interview"); assert.ok(h.findAll(n=>n.props.role === "alert").length);
});

test("Career project, resume, skill and interview detail edits survive reload", () => {
 const h=harness();h.render();h.click("Career");
 const submit=()=>{h.findAll(n=>n.type === "form")[0].props.onSubmit({preventDefault(){}});h.render();};
 h.click("Portfolio");h.click("+ Add project");h.field("Project name","Hardware evidence");h.field("Demo / hardware video URL","https://example.com/video");h.field("Resume bullet","Built and tested a sensor");submit();
 assert.equal(h.findAll(n=>n.props.role === "alert").map(h.text).join(""), ""); h.click("Hardware evidence");assert.ok(h.findAll(n=>n.type === "a" && n.props.href === "https://example.com/video").length);h.click("Edit project");h.field("Your contribution","Firmware");submit();
 h.click("Resume");h.click("General");h.click("Edit resume");h.field("Document updated date","2026-09-10");h.field("Language","EN");submit();
 h.click("Skills");h.click("SQL");h.click("Edit skill");h.field("What you can do independently","Write joins independently");h.field("Next practice","Practice subqueries");submit();
 h.click("Interview");h.click("Behavioral questions");h.click("Edit interview topic");h.field("STAR", "A team project");submit();
 h.refresh();h.click("Career");h.click("Portfolio");h.click("Hardware evidence");h.click("Edit project");assert.ok(h.findAll(n=>n.type === "textarea" && n.props.value === "Firmware").length);
 const resume=JSON.parse(h.storage.get("amaris.career.resume"));assert.equal(resume[0].documentUpdatedAt,"2026-09-10");assert.equal(resume[0].id,"resume-0");
});

test("Calendar selection survives reload and failed persistence keeps the selected source", () => {
  const h = harness(); h.render(); h.click("Calendar");
  const picker = () => h.findAll(n => n.props.id === "google-calendar-source")[0];
  assert.equal(picker().props.value, "primary");
  picker().props.onChange({ target: { value: "class-math@group.calendar.google.com" } }); h.render();
  assert.equal(h.storage.get("agent-helper.google-calendar-selection"), "class-math@group.calendar.google.com");
  assert.equal(picker().props.value, "class-math@group.calendar.google.com");
  h.refresh(); h.click("Calendar"); assert.equal(picker().props.value, "class-math@group.calendar.google.com");
  picker().props.onChange({ target: { value: "primary" } }); h.render(); h.refresh(); h.click("Calendar");
  assert.equal(picker().props.value, "primary");
  h.failWrites(); picker().props.onChange({ target: { value: "different-calendar" } }); h.render();
  assert.equal(picker().props.value, "primary"); assert.ok(h.findAll(n => n.props.role === "alert").length);
});
