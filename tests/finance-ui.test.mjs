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

test("Simulator previews immediately, persists scenarios and supports comparison, duplicate, edit and delete",()=>{
 const {h}=setup();h.render();h.click("Simulator");h.click("+ Add scenario");h.field("Scenario name","Current Plan");h.field("Monthly income","1000");h.field("Monthly expenses","500");h.field("Monthly savings","100");h.field("Monthly investment contribution","100");h.field("Simulation period","10");
 const before=h.text(h.findAll(n=>n.props.role==="status").at(-1));h.field("Expected annual return","8");assert.notEqual(h.text(h.findAll(n=>n.props.role==="status").at(-1)),before);submit(h);assert.equal(readPlan(h).scenarios[0].years,10);
 h.click("Duplicate");assert.equal(readPlan(h).scenarios.length,2);assert.notEqual(readPlan(h).scenarios[0].id,readPlan(h).scenarios[1].id);
 h.click("Edit scenario");h.field("Scenario name","Higher Investment");h.field("Monthly investment contribution","200");submit(h);assert.ok(readPlan(h).scenarios.some(s=>s.name==="Higher Investment"));assert.ok(h.text(h.render()).includes("Versus"));
 h.refresh();h.click("Simulator");assert.equal(readPlan(h).scenarios.length,2);h.click("Delete scenario");assert.equal(readPlan(h).scenarios.length,1);
 h.click("+ Add scenario");h.field("Scenario name","Keep draft");h.failWrites();submit(h);assert.equal(h.findAll(n=>n.props.role==="dialog").length,1);assert.equal(readPlan(h).scenarios.length,1);
});

test("Monthly Review requires review and explicit confirmation, preserves history and appends replacements",()=>{
 const {h,today}=setup();const month=h.load("src/lib/finance-analytics.ts").shiftFinanceMonth(today.slice(0,7),-1);
 h.storage.set("agent-helper.finance.v1.month",month);
 const records=[{id:"salary",title:"Salary",type:"income",amount:100000,category:"Salary",date:month+"-01",note:"",updatedAt:"old"},{id:"food",title:"Food",type:"expense",amount:20000,category:"Food",date:month+"-02",note:"",updatedAt:"old"}];
 const raw=JSON.stringify(records);h.storage.set("agent-helper.finance.v1",raw);h.render();h.click("Monthly Review");h.click("Close Month");assert.equal(h.storage.get("agent-helper.finance.v1.analytics"),undefined);
 assert.equal(h.findAll(n=>n.type==="button"&&h.text(n)==="Save close")[0].props.disabled,true);
 h.field("I have reviewed",true);h.click("Save close");assert.equal(readPlan(h).closes.length,1);assert.equal(h.storage.get("agent-helper.finance.v1"),raw);const original=JSON.stringify(readPlan(h).closes[0]);
 h.click("Back to live review");assert.ok(h.findAll(n=>n.type==="button"&&h.text(n)==="Review replacement").length);
 records[1].amount=40000;records[1].category="Changed category";h.storage.set("agent-helper.finance.v1",JSON.stringify(records));h.refresh();h.click("Monthly Review");
 const historical=h.findAll(n=>n.type==="button"&&h.text(n).includes(month+" · revision 1"))[0];historical.props.onClick();h.render();assert.equal(JSON.stringify(readPlan(h).closes[0]),original);assert.ok(h.text(h.render()).includes("Values and labels are frozen"));
 h.click("Back to live review");h.click("Review replacement");h.field("I confirm replacing",true);h.click("Save close");assert.equal(readPlan(h).closes.length,2);assert.equal(JSON.stringify(readPlan(h).closes[0]),original);assert.equal(readPlan(h).closes[1].report.expenses,40000);
 h.click("Analytics");h.field("Closed history window","12");assert.ok(h.text(h.render()).includes("Closed savings rate"));
});

test("transaction purpose tags are optional and enable actual contribution reporting",()=>{
 const {h,today}=setup();const old={id:"transfer",title:"Contribution",type:"expense",amount:5000,category:"Food",date:today,note:"Original note",updatedAt:"old"};h.storage.set("agent-helper.finance.v1",JSON.stringify([old]));h.render();h.click("Transactions");
 h.findAll(n=>n.type==="button"&&n.props["aria-label"]?.endsWith(" Contribution"))[0].props.onClick();h.render();h.field("Payment purpose","investment");submit(h);
 const saved=JSON.parse(h.storage.get("agent-helper.finance.v1"));assert.equal(saved[0].purpose,"investment");assert.equal(saved[0].note,"Original note");h.click("Monthly Review");assert.ok(h.text(h.render()).includes("Investment contribution"));
});
