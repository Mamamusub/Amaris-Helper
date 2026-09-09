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
    if (cache.has(file)) return cache.get(file);
    const source = fs.readFileSync(file, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod = { exports: {} };
    const stub = () => null;
    const importModule = (name) => {
      if (name === "react") return react;
      if (/components\/(pipeline-view|integrations)/.test(name)) return { default: stub, AIStatus: stub, CalendarReturnNotice: stub, IntegrationSettings: stub, TaskIntegrations: stub };
      if (name.endsWith("use-pipeline")) return { usePipeline: () => ({ runs: [], start: stub, saveResponse: stub }) };
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? `src/${name.slice(2)}` : path.join(path.dirname(file), name);
        return load([`${base}.ts`, `${base}.tsx`].find((file) => fs.existsSync(file)));
      }
      return require(name);
    };
    vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: importModule, window: { localStorage }, crypto: { randomUUID }, Date, Intl, setInterval, clearInterval, AbortSignal, console });
    cache.set(file, mod.exports);
    return mod.exports;
  }
  const Shell = load("src/components/app-shell.tsx").default;
  function walk(element, at = "root") {
    if (element == null || typeof element === "boolean") return null;
    if (Array.isArray(element)) return element.map((item, index) => walk(item, `${at}/${item?.key ?? index}`));
    if (typeof element !== "object") return element;
    const { type, props, key } = element;
    at += `/${key ?? (typeof type === "function" ? type.name : type)}`;
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
  const field = (label, value) => { const group = findAll((n) => n.type === "label" && text(n).startsWith(label))[0]; assert.ok(group, label); const input = findAll((n) => ["input", "textarea", "select"].includes(n.type), group)[0]; input.props.onChange({ target: { value, checked: value } }); render(); };
  const save = () => { const form = findAll((n) => n.type === "form" && n.props.className === "panel task-editor")[0]; form.props.onSubmit({ preventDefault() {} }); render(); };
  return { failWrites() { failWrites = true; }, storage, load, render, click, field, save, findAll, text, refresh() { hooks.clear(); render(); } };
}

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
  h.click("Tasks2");
  h.click("Edit"); h.field("Title", "Updated lab"); h.field("Priority", "High"); h.save();
  h.click("Calendar"); assert.ok(h.findAll((n) => n.type === "h4" && h.text(n) === "Updated lab").length === 1);
  h.click("Edit"); h.field("Description", "Updated from Calendar"); h.save();
  h.click("Today"); assert.ok(h.findAll((n) => n.type === "strong" && h.text(n) === "Updated lab").length === 1);
  h.click("☆ Focus"); h.click("Edit"); h.field("Due date", shiftDay(today, -1)); h.save();
  assert.equal(h.load("src/lib/task-model.ts").todayTasks(read(), today).length, 1);
  h.click("Complete"); assert.equal(h.load("src/lib/task-model.ts").todayTasks(read(), today).length, 0);
  h.click("Tasks1"); h.click("Reopen"); h.click("Delete");
  assert.equal(read().find((task) => task.id === id).deletedAt != null, true);
  h.refresh(); h.click("Undo"); assert.equal(read().find((task) => task.id === id).deletedAt, undefined);
  h.click("Tasks2"); h.click("Edit"); h.field("Due date", ""); h.save();
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
    if (view !== "Today") h.click(view === "Tasks" ? "Tasks0" : view);
    if (view === "Study") { h.findAll((n) => n.type === "input" && n.props["aria-label"] === "New subject name")[0].props.onChange({ target: { value: "New subject" } }); h.render(); h.findAll((n) => n.type === "form" && n.props.className === "add-subject")[0].props.onSubmit({ preventDefault() {} }); h.render(); h.findAll((n) => n.type === "button" && n.props.className === "subject-card")[0].props.onClick(); h.render(); }
    h.click(view === "Today" ? "+" : "+ New task"); h.field("Title", `${view} created`); h.save();
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
