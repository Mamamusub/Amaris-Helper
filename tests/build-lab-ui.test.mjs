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
      if (name === "next/navigation") return { useRouter: () => ({ push() {} }) }; if (name === "react") return react; if (name === "next/link") return { default: ({ children, ...props }) => ({ type: "a", props: { ...props, children } }) };
      if (name.endsWith("account-boundary")) return { default: ({ children }) => children, useCloud: () => null, useCloudSnapshot: () => null, useAccountStorage: () => localStorage };
      if (/components\/(pipeline-view|integrations)/.test(name)) return { default: stub, AIStatus: stub, CalendarReturnNotice: stub, IntegrationSettings: stub, TaskIntegrations: stub };
      if (name.endsWith("use-pipeline")) return { usePipeline: () => ({ runs: [], start: stub, saveResponse: stub }) };
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? `src/${name.slice(2)}` : path.join(path.dirname(file), name);
        return load([`${base}.ts`, `${base}.tsx`].find((file) => fs.existsSync(file)));
      }
      return require(name);
    };
    vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: importModule, window: { localStorage, confirm: () => true, location: { assign() {} } }, localStorage, document: {activeElement:{focus() {}}}, crypto: { randomUUID }, Date, Intl, URL, setInterval, clearInterval, AbortSignal, console });
    cache.set(file, mod.exports);
    return mod.exports;
  }
  const Shell = load("src/components/build-lab.tsx").default; let routeId;
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
  const render = () => { visited = new Set(); tree = walk({ type: Shell, props: {projectId: routeId} }); for (const key of hooks.keys()) if (!visited.has(key)) hooks.delete(key); return tree; };
  const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.children) : node ?? "";
  const findAll = (predicate, node = tree) => {
    if (Array.isArray(node)) return node.flatMap((child) => findAll(predicate, child));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...findAll(predicate, node.children)];
  };
  const click = (label, node = tree) => { const button = findAll((n) => n.type === "button" && (text(n).trim() === label || (n.props.className?.includes("nav-item") && text(n).trim().endsWith(label))), node)[0]; assert.ok(button, `button ${label}`); button.props.onClick(); render(); };
  const field = (label, value) => { const group = findAll((n) => n.type === "label" && text(n).startsWith(label), findAll(n => n.type === "form").at(-1) ?? tree)[0]; assert.ok(group, label); const input = findAll((n) => ["input", "textarea", "select"].includes(n.type), group)[0]; input.props.onChange({ target: { value, checked: value } }); render(); };
  const save = () => { const form = findAll((n) => n.type === "form")[0]; form.props.onSubmit({ preventDefault() {} }); render(); };
  return { detail(id) { routeId=id; hooks.clear(); render(); }, failWrites() { failWrites = true; }, storage, load, render, click, field, save, findAll, text, refresh() { hooks.clear(); render(); } };
}


test('Build Lab forms perform project/task/log/resource CRUD, filters and progress through real handlers',()=>{
 const h=harness();h.render();h.click('+ New Project');h.field('Project Name','Monitor');h.field('Type','Hardware / IoT');h.field('Status','In Progress');h.field('Technologies','ESP32, MicroPython');h.save();
 const read=()=>JSON.parse(h.storage.get('agent-helper.build-lab')).projects;
 assert.equal(read()[0].name,'Monitor');const id=read()[0].id;
 h.click('Edit');h.field('Project Name','Sensor Monitor');h.save();assert.equal(read()[0].name,'Sensor Monitor');
 h.field('Search','nomatch');assert.ok(h.text(h.render()).includes('No matching projects'));h.field('Search','ESP32');assert.ok(h.text(h.render()).includes('Sensor Monitor'));
 h.field('Status','Completed');assert.ok(h.text(h.render()).includes('No matching projects'));h.field('Status','In Progress');assert.ok(h.text(h.render()).includes('Sensor Monitor'));
 h.detail(id);
 const section=title=>h.findAll(n=>n.type==='section'&&h.findAll(n=>n.type==='h2'&&h.text(n)===title,n).length)[0];
 h.click('+ Add',section('Checklist'));h.field('Title','Prototype');h.field('Priority','High');h.save();assert.equal(read()[0].tasks.length,1);
 const checkbox=h.findAll(n=>n.props['aria-label']==='Complete Prototype')[0];checkbox.props.onChange();h.render();assert.equal(read()[0].tasks[0].completed,true);assert.ok(h.text(h.render()).includes('100%'));
 h.click('Edit',section('Checklist'));h.field('Title','Prototype tested');h.save();assert.equal(read()[0].tasks[0].title,'Prototype tested');
 h.click('+ Add',section('Dev Log'));h.field('Title','First run');h.field('Content','Sensor works');h.save();assert.equal(read()[0].logs[0].content,'Sensor works');
 h.click('Edit',section('Dev Log'));h.field('Content','Sensor calibrated');h.save();assert.equal(read()[0].logs[0].content,'Sensor calibrated');
 h.click('+ Add',section('Links / Resources'));h.field('Name','Docs');h.field('URL','https://example.com/docs');h.field('Resource Type','Documentation');h.save();assert.equal(read()[0].resources[0].url,'https://example.com/docs');
 h.click('+ Add',section('Milestones'));h.field('Title','MVP');h.save();assert.equal(read()[0].milestones[0].title,'MVP');
 h.click('Edit',section('Portfolio Info'));h.field('Key Result / Achievement','Successful sensor alerts');h.field('Include in Resume',true);h.save();assert.equal(read()[0].includeInResume,true);
 h.refresh();assert.ok(h.text(h.render()).includes('Sensor calibrated'));
 h.click('Delete',section('Checklist'));assert.equal(read()[0].tasks.length,0);assert.ok(h.text(h.render()).includes('0%'));
 h.click('Delete',section('Dev Log'));h.click('Delete',section('Links / Resources'));h.click('Delete',section('Milestones'));assert.equal(read()[0].logs.length,0);assert.equal(read()[0].resources.length,0);assert.equal(read()[0].milestones.length,0);
 h.click('Delete Project');assert.equal(read().length,0);
});
test('Build Lab validates names, URLs and dates; failed persistence retains editor',()=>{
 const h=harness();h.render();h.click('+ New Project');h.field('Project Name','   ');h.save();assert.equal(h.storage.size,0);
 h.field('Project Name','Valid');h.field('Repository URL','javascript:alert(1)');h.save();assert.equal(h.storage.size,0);
 h.field('Repository URL','https://github.com/example/repo');h.field('Start Date','2026-10-10');h.field('Target Date','2026-10-01');h.save();assert.equal(h.storage.size,0);
 h.field('Target Date','2026-10-11');h.failWrites();h.save();assert.equal(h.storage.size,0);assert.equal(h.findAll(n=>n.props.role==='dialog').length,1);assert.ok(h.text(h.render()).includes('Quota exceeded'));
});

