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
  const Shell = load("src/components/finance-view.tsx").default;
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

const submit = h => {const dialog=h.findAll(n=>n.props.role==="dialog")[0];const form=h.findAll(n=>n.type==="form",dialog)[0];form.props.onSubmit({preventDefault(){},nativeEvent:{}});h.render();};
const readPlan = h => JSON.parse(h.storage.get("agent-helper.finance.v1.analytics"));
const setup = () => {
 const h=harness(); const today=h.load("src/lib/calendar.ts").dayKey(new Date());
 h.storage.set("agent-helper.finance.v1.categories",JSON.stringify({income:["Salary"],expense:["Food","Travel"]}));
 h.storage.set("agent-helper.finance.v1.month",today.slice(0,7));
 return {h,today};
};
test("Finance tabs preserve the ledger and calendar while planning CRUD persists across reload",()=>{
 const {h,today}=setup();
 const original={id:"legacy",title:"Lunch",type:"expense",amount:2500,category:"Food",date:today,note:"Saved evidence",updatedAt:"old"};
 h.storage.set("agent-helper.finance.v1",JSON.stringify([original]));
 h.render(); assert.equal(h.findAll(n=>n.props["aria-label"]==="Finance sections").length,1);
 h.click("Budget");h.click("+ Add budget");h.field("Expense category","Food");h.field("Budget amount","100");submit(h);assert.equal(readPlan(h).budgets[0].amount,10000);assert.ok(h.text(h.render()).includes("25.0% used"));
 h.click("Edit");h.field("Budget amount","200");submit(h);assert.equal(readPlan(h).budgets[0].amount,20000);
 h.click("Goals");h.click("+ Add goal");h.field("Goal name","Emergency fund");h.field("Target amount","1000");h.field("Current amount","100");h.field("Monthly contribution","100");h.field("Notes","Saved notes");submit(h);assert.equal(readPlan(h).goals[0].current,10000);
 h.click("Net Worth");h.click("+ Add account");h.field("Account name","Wallet");h.field("Current value","1000");submit(h);h.click("+ Add account");h.field("Account name","Loan");h.field("Account type","Debt");h.field("Current value","100");submit(h);h.click("Save current month snapshot");assert.equal(readPlan(h).snapshots[0].assets,100000);assert.equal(readPlan(h).snapshots[0].liabilities,10000);
 h.click("Analytics");h.field("History window","12");h.field("Spending trend","weekly");assert.ok(h.findAll(n=>n.type==="svg").length);
 h.click("Cash Flow");assert.ok(h.text(h.render()).includes("30-day cash flow forecast"));
 h.click("Transactions");assert.ok(h.findAll(n=>n.props["aria-label"]==="Account entries").length);assert.ok(h.text(h.render()).includes("Lunch"));assert.equal(h.storage.get("agent-helper.finance.v1"),JSON.stringify([original]));
 h.refresh();h.click("Goals");assert.ok(h.text(h.render()).includes("Saved notes"));h.click("Delete");h.click("Cancel");assert.equal(readPlan(h).goals.length,1);h.click("Delete");h.click("Delete",h.findAll(n=>n.props.role==="dialog")[0]);assert.equal(readPlan(h).goals.length,0);
 h.click("Budget");h.click("Delete");h.click("Delete",h.findAll(n=>n.props.role==="dialog")[0]);assert.equal(readPlan(h).budgets.length,0);assert.equal(h.storage.get("agent-helper.finance.v1"),JSON.stringify([original]));
});
test("Recurring UI records due payments once, supports pause/resume and retains future calendar records",()=>{
 const {h,today}=setup();h.render();h.click("Recurring");h.click("+ Add recurring");h.field("Name","Weekly groceries");h.field("Amount","50");h.field("Frequency","weekly");submit(h);
 assert.equal(readPlan(h).recurring[0].nextDate,today);h.click("Pause");assert.equal(readPlan(h).recurring[0].paused,true);h.click("Record due payments");assert.equal(h.storage.get("agent-helper.finance.v1"),undefined);h.click("Resume");h.click("Record due payments");
 const entries=()=>JSON.parse(h.storage.get("agent-helper.finance.v1"));assert.equal(entries().length,1);assert.equal(entries()[0].amount,5000);h.click("Record due payments");assert.equal(entries().length,1);
 h.click("Transactions");assert.ok(h.text(h.render()).includes("Weekly groceries"));h.refresh();h.click("Recurring");h.click("Record due payments");assert.equal(entries().length,1);
});
test("failed planning writes retain the editor and corrupt analytics never reset saved transactions",()=>{
 const {h}=setup();h.render();h.click("Goals");h.click("+ Add goal");h.field("Goal name","Fund");h.field("Target amount","100");h.failWrites();submit(h);assert.equal(h.findAll(n=>n.props.role==="dialog").length,1);assert.equal(h.storage.get("agent-helper.finance.v1.analytics"),undefined);assert.ok(h.findAll(n=>n.props.role==="alert").length);
 const other=setup().h;other.storage.set("agent-helper.finance.v1.analytics","broken");other.render();assert.ok(other.findAll(n=>n.props.role==="alert").length);other.click("Transactions");assert.ok(other.findAll(n=>n.props["aria-label"]==="Account entries").length);assert.equal(other.storage.get("agent-helper.finance.v1.analytics"),"broken");
});
