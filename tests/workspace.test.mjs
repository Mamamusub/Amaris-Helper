import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
const db = new PGlite();
const alice = "00000000-0000-0000-0000-000000000001";
const bob = "00000000-0000-0000-0000-000000000002";
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${alice}'), ('${bob}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  await db.exec(fs.readFileSync("supabase/migrations/202609090001_workspace.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/202609160001_account_documents.sql", "utf8"));
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects(id bigint generated always as identity primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    grant usage on schema storage to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant usage on all sequences in schema storage to authenticated;`);
  await db.exec(fs.readFileSync("supabase/migrations/202609160002_account_files.sql", "utf8"));
});
after(() => db.close());
let serial = Promise.resolve();
function asUser(user, sql, params = [], role = "authenticated") {
  const run = serial.then(async () => {
    await db.exec(`begin; set local role ${role};`);
    try { await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? ""]); const result = await db.query(sql, params); await db.exec("commit"); return result.rows; }
    catch (error) { await db.exec("rollback"); throw error; }
  });
  serial = run.catch(() => {}); return run;
}
const task = (id, title = id) => ({ id, title, description: "", deadline: "2026-09-09", team: "Study", assignedAgent: "researcher", status: "Planned", priority: "Medium", createdAt: "2026-09-09", updatedAt: "2026-09-09" });
const change = (id, version = 0, data = task(id), kind = "task") => ({ id, kind, version, data });
async function apply(user, changes, operation = randomUUID(), importing = false) { return (await asUser(user, "select public.workspace_apply($1,$2::jsonb,$3) as records", [operation, JSON.stringify(changes), importing]))[0].records; }
async function snapshot(user) { return (await asUser(user, "select public.workspace_snapshot() as records"))[0].records; }

test("migration executes; RLS and direct-write grants isolate accounts", async () => {
  await apply(alice, [change("private")]);
  const visible = await asUser(bob, "select * from public.workspace_records where user_id=$1", [alice]);
  assert.equal(visible.length, 0);
  await assert.rejects(asUser(bob, "update public.workspace_records set data='{}' where user_id=$1", [alice]), /permission denied/);
  await assert.rejects(asUser(alice, "delete from public.workspace_records"), /permission denied/);
  await assert.rejects(asUser(null, "select public.workspace_snapshot()", [], "anon"), /permission denied/);
  const owned = await snapshot(bob); assert.equal(owned.some((row) => row.id === "private"), false);
});

test("private file storage permits only owner paths and refuses overwrites", async () => {
  const bucket = (await db.query("select public, file_size_limit from storage.buckets where id='workspace-files'")).rows[0];
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 25 * 1024 * 1024);
  await asUser(alice, "insert into storage.objects(bucket_id,name) values ('workspace-files',$1)", [`${alice}/resume`]);
  assert.equal((await asUser(alice, "select * from storage.objects")).length, 1);
  assert.equal((await asUser(bob, "select * from storage.objects")).length, 0);
  await assert.rejects(asUser(bob, "insert into storage.objects(bucket_id,name) values ('workspace-files',$1)", [`${alice}/spoof`]), /row-level security/);
  assert.equal((await asUser(alice, "update storage.objects set name='changed' returning *")).length, 0);
});

test("composite foreign keys reject cross-account subjects and parent tasks atomically", async () => {
  await apply(alice, [change("subject-a", 0, { id: "subject-a", name: "Private subject" }, "subject")]);
  await assert.rejects(apply(bob, [change("bad", 0, { ...task("bad"), subjectId: "subject-a" })]), /foreign key/);
  await assert.rejects(apply(bob, [change("bad-parent", 0, { ...task("bad-parent"), parentTaskId: "private" })]), /foreign key/);
  assert.equal((await snapshot(bob)).some((row) => row.id.startsWith("bad")), false);
});

test("import is atomic and idempotent; preserves references, notes and subtasks without overwriting", async () => {
  const records = [change("import-subject", 0, { id: "import-subject", name: "DS", context: "Private notes" }, "subject"), change("import-task", 0, { ...task("import-task"), subjectId: "import-subject", subtasks: [{ id: "step", title: "Test", done: true }] }), change("import-child", 0, { ...task("import-child"), parentTaskId: "import-task" })];
  const operation = randomUUID();
  await apply(alice, records, operation, true); await apply(alice, records, operation, true);
  await apply(alice, [change("import-task", 1, { ...records[1].data, title: "Cloud edited" })]);
  await apply(alice, records, randomUUID(), true);
  const rows = await snapshot(alice);
  assert.equal(rows.filter((row) => row.id === "import-task").length, 1);
  const imported = rows.find((row) => row.id === "import-task"); assert.equal(imported.data.title, "Cloud edited"); assert.equal(imported.data.subtasks[0].done, true);
  assert.equal(rows.find((row) => row.id === "import-subject").data.context, "Private notes");
  await assert.rejects(apply(alice, [change("different")], operation, true), /operation reused/);
});

test("version conflicts never overwrite newer edits or resurrect tombstones", async () => {
  await apply(alice, [change("conflict")]);
  await apply(alice, [change("conflict", 1, { ...task("conflict"), deletedAt: "2026-09-09" })]);
  await assert.rejects(apply(alice, [change("conflict", 1, { ...task("conflict"), title: "Stale device" })]), /version conflict/);
  assert.ok((await snapshot(alice)).find((row) => row.id === "conflict").data.deletedAt);
  await apply(alice, [change("conflict", 2)]); assert.equal((await snapshot(alice)).find((row) => row.id === "conflict").data.deletedAt, undefined);
});

function load(file, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, crypto: { randomUUID }, fetch, AbortSignal, navigator: { onLine: true }, require(name) { return load(path.join(path.dirname(file), `${name}.ts`), cache); } });
  cache.set(file, mod.exports); return mod.exports;
}
const { WorkspaceSync } = load("src/lib/workspace-sync.ts");
const { accountStorage, legacyDocuments } = load("src/lib/account-storage.ts");
const memory = () => { const values = new Map(); return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }; };
function transport(user) {
  const faults = { offline: false, loseReply: false };
  const request = async (_url, init) => {
    if (faults.offline) throw new Error("Offline");
    try {
      let records;
      if (init?.method === "POST") {
        const body = JSON.parse(init.body);
        if (body.userId !== user) return Response.json({}, { status: 401 });
        records = await apply(user, body.changes, body.operationId, body.importing);
        if (faults.loseReply) { faults.loseReply = false; throw new Error("Lost reply"); }
      } else records = await snapshot(user);
      return Response.json({ userId: user, records });
    } catch (error) { if (/version conflict/.test(error.message)) return Response.json({ error: "Conflict" }, { status: 409 }); throw error; }
  };
  return { request, faults };
}
function settled(store) { return new Promise((resolve) => { const check = () => { if (["บันทึกแล้ว", "บันทึกไม่สำเร็จ", "ออฟไลน์"].includes(store.getSnapshot().status)) { off(); resolve(); } }; const off = store.subscribe(check); check(); }); }

test("account documents sync across devices, remain private, and keep conflicting offline edits", async () => {
  const wire = transport(alice), local = memory();
  const a = new WorkspaceSync(alice, local, wire.request);
  const b = new WorkspaceSync(alice, memory(), transport(alice).request);
  const other = new WorkspaceSync(bob, memory(), transport(bob).request);
  await a.sync(); await b.sync(); await other.sync();
  const storageA = accountStorage(a, local), storageB = accountStorage(b, memory());
  const key = `${a.key}.career.resume`;
  storageA.setItem(key, '[{"id":"cv","name":"My resume"}]');
  await settled(a); await b.sync();
  assert.equal(storageB.getItem(key), storageA.getItem(key));
  assert.equal(accountStorage(other, memory()).getItem(`${other.key}.career.resume`), null);
  storageA.setItem("amaris.exam.info", '{"math":[]}');
  await settled(a); await b.sync();
  assert.equal(storageB.getItem("amaris.exam.info"), '{"math":[]}');
  wire.faults.offline = true;
  storageA.setItem(key, '"offline draft"'); await settled(a);
  storageB.setItem(key, '"newer device"'); await settled(b);
  wire.faults.offline = false; await a.sync();
  assert.equal(a.getSnapshot().conflict, true);
  assert.equal(storageA.getItem(key), '"offline draft"');
  await b.sync(); assert.equal(storageB.getItem(key), '"newer device"');
  a.dispose(); b.dispose(); other.dispose();
});

test("legacy import only includes the selected account and never imports credentials or journals", () => {
  const values = new Map([
    ["amaris.account.alice.career.goal", "{}"], ["amaris.account.bob.career.goal", "{}"],
    ["amaris.account.alice.finance.v1", "[]"], ["amaris.account.alice.op.private", "secret"],
    ["amaris.exam.info", "{}"], ["amaris.career.skills", "[]"], ["API_KEY", "secret"],
  ]);
  const storage = { length: values.size, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null };
  assert.deepEqual(Array.from(legacyDocuments(storage, "amaris.account.alice"), row => row.id), ["career.goal", "finance.v1"]);
  assert.deepEqual(Array.from(legacyDocuments(storage), row => row.id), ["amaris.exam.info", "career.skills"]);
  assert.equal(values.get("API_KEY"), "secret");
});

test("Finance planning and recurring ledger updates sync as one account-owned operation without duplicate payments", async () => {
 const {financePlanDefaults,recordRecurring,readFinancePlan}=load("src/lib/finance-analytics.ts");
 const {readEntries}=load("src/lib/finance.ts");
 const local=memory(), a=new WorkspaceSync(alice,local,transport(alice).request), b=new WorkspaceSync(alice,memory(),transport(alice).request);
 await a.sync();await b.sync();
 const storageA=accountStorage(a,local),storageB=accountStorage(b,memory());
 const ledgerId="finance.v1", planId="finance.v1.analytics", ledgerKey=`${a.key}.${ledgerId}`, planKey=`${a.key}.${planId}`;
 const plan=financePlanDefaults();plan.recurring=[{id:"groceries",name:"Groceries",amount:1000,category:"Food",type:"expense",frequency:"weekly",startDate:"2026-10-01",nextDate:"2026-10-01",endDate:"",paused:false}];
 a.enqueueBatch([{kind:"document",value:[{id:ledgerId,value:"[]"},{id:planId,value:JSON.stringify(plan)}]}]);await settled(a);await b.sync();
 const next=recordRecurring(readFinancePlan(storageA,planKey),readEntries(storageA,ledgerKey),"2026-10-10","now");
 assert.equal(next.added,2);
 const priorPlanVersion=a.version("document",planId);
 assert.equal(a.enqueueBatch([{kind:"document",value:[{id:ledgerId,value:JSON.stringify(next.entries)}],expected:{[ledgerId]:a.version("document",ledgerId)}},{kind:"document",value:[{id:planId,value:JSON.stringify(next.plan)}],expected:{[planId]:priorPlanVersion}}]),true);
 await settled(a);await b.sync();
 assert.equal(storageB.getItem(ledgerKey),storageA.getItem(ledgerKey));assert.equal(storageB.getItem(planKey),storageA.getItem(planKey));
 assert.equal(recordRecurring(readFinancePlan(storageB,planKey),readEntries(storageB,ledgerKey),"2026-10-10","later").added,0);
 const currentLedger=(await snapshot(alice)).find(row=>row.kind==="document"&&row.id===ledgerId);
 await assert.rejects(apply(alice,[change(ledgerId,currentLedger.version,{id:ledgerId,value:"[]"},"document"),change(planId,priorPlanVersion,{id:planId,value:JSON.stringify(plan)},"document")]),/version conflict/);
 assert.equal((await snapshot(alice)).find(row=>row.kind==="document"&&row.id===ledgerId).data.value,JSON.stringify(next.entries));
 assert.equal((await snapshot(bob)).some(row=>row.kind==="document"&&row.id===planId),false);
 a.dispose();b.dispose();
});

test("identical countdown completion from two devices is acknowledged without a false conflict", async () => {
  const data = { id: "focus-session", value: JSON.stringify({ id: "round", endedAt: 100000, elapsedMs: 60000 }) };
  await apply(alice, [change(data.id, 0, data, "document")]);
  await apply(alice, [change(data.id, 0, data, "document")]);
  const row = (await snapshot(alice)).find(row => row.kind === "document" && row.id === data.id);
  assert.equal(row.version, 1);
});

test("subject deletion and task detachment persist together after offline reload", async () => {
  const wire = transport(bob), storage = memory();
  const store = new WorkspaceSync(bob, storage, wire.request);
  await store.sync();
  const subject = { id: "delete-subject", name: "Math" };
  const linked = { ...task("detach-task"), subjectId: subject.id };
  store.enqueueBatch([{ kind: "subject", value: [subject] }, { kind: "task", value: [linked] }]);
  await settled(store);
  wire.faults.offline = true;
  store.enqueueBatch([{ kind: "task", value: [{ ...linked, subjectId: undefined }] }, { kind: "subject", value: [{ ...subject, deletedAt: "2026-09-11" }] }]);
  assert.equal(store.getSnapshot().data.subjects.some((row) => row.id === subject.id), false);
  assert.equal(store.getSnapshot().pending.length, 1);
  await settled(store);
  store.dispose();
  wire.faults.offline = false;
  const restored = new WorkspaceSync(bob, storage, wire.request);
  await restored.sync();
  const rows = await snapshot(bob);
  assert.ok(rows.find((row) => row.id === subject.id).data.deletedAt);
  assert.equal(rows.find((row) => row.id === linked.id).data.subjectId, undefined);
  assert.equal(restored.getSnapshot().data.subjects.some((row) => row.id === subject.id), false);
  restored.dispose();
});

test("two device sessions sync confirmed edits and retain offline drafts across remount", async () => {
  const wire = transport(bob); const cacheA = memory();
  const a = new WorkspaceSync(bob, cacheA, wire.request); const b = new WorkspaceSync(bob, memory(), transport(bob).request);
  await a.sync(); await b.sync();
  a.enqueue("task", [task("devices")]); assert.equal(a.getSnapshot().status, "กำลังบันทึก");
  await settled(a); await b.sync(); assert.equal(b.getSnapshot().data.tasks.find((row) => row.id === "devices").title, "devices");
  wire.faults.offline = true; a.enqueue("task", [{ ...task("devices"), title: "Offline draft" }]); await settled(a);
  assert.equal(a.getSnapshot().pending.length, 1); a.dispose(); wire.faults.offline = false;
  const restored = new WorkspaceSync(bob, cacheA, wire.request); await restored.sync(); await b.sync();
  assert.equal(b.getSnapshot().data.tasks.find((row) => row.id === "devices").title, "Offline draft");
  assert.equal(restored.getSnapshot().pending.length, 0);
  const other = new WorkspaceSync(alice, cacheA, transport(alice).request); assert.equal(other.getSnapshot().data.tasks.length, 0);
  restored.dispose(true); assert.equal(cacheA.getItem(restored.key), null);
});

test("lost server acknowledgements replay exactly once; simultaneous edits report conflicts", async () => {
  const wire = transport(bob); const a = new WorkspaceSync(bob, memory(), wire.request); const b = new WorkspaceSync(bob, memory(), transport(bob).request);
  await a.sync(); wire.faults.loseReply = true;
  a.enqueue("task", [task("lost")]); await settled(a); assert.equal(a.getSnapshot().pending.length, 1);
  await a.sync(); assert.equal(a.getSnapshot().pending.length, 0); await b.sync();
  assert.equal(b.getSnapshot().records.find((row) => row.id === "lost").version, 1);
  const stale = b.version("task", "lost");
  a.enqueue("task", [{ ...task("lost"), title: "First device" }]); await settled(a);
  b.enqueue("task", [{ ...task("lost"), title: "Second device" }], { lost: stale }); await settled(b);
  assert.equal(b.getSnapshot().conflict, true); assert.equal(b.getSnapshot().pending[0].changes[0].data.title, "Second device");
  assert.equal((await snapshot(bob)).find((row) => row.id === "lost").data.title, "First device");
});

test("Local import excludes untouched demo records and never removes the source", () => {
  const { localImport } = load("src/lib/workspace-model.ts"); const { demoTasks, demoSubjects } = load("src/lib/storage.ts");
  const storage = memory(); storage.setItem("agent-helper.tasks", JSON.stringify(demoTasks)); storage.setItem("agent-helper.subjects", JSON.stringify(demoSubjects));
  assert.equal(localImport(storage).length, 0);
  const original = JSON.stringify([...demoTasks, task("real")]); storage.setItem("agent-helper.tasks", original);
  assert.equal(localImport(storage).length, 1); assert.equal(storage.getItem("agent-helper.tasks"), original);
});

test("discarding an import never counts as a server acknowledgement", async () => {
  const wire = transport(bob); wire.faults.offline = true;
  const store = new WorkspaceSync(bob, memory(), wire.request);
  store.import([change("discarded-import")]);
  const operationId = store.getSnapshot().pending[0].operationId;
  await settled(store);
  assert.equal(store.getSnapshot().acknowledged.includes(operationId), false);
  wire.faults.offline = false;
  await store.discardPending();
  assert.equal(store.getSnapshot().pending.length, 0);
  assert.equal(store.getSnapshot().acknowledged.includes(operationId), false);
  assert.equal((await snapshot(bob)).some((row) => row.id === "discarded-import"), false);
  store.import([change("confirmed-import")]);
  const confirmedId = store.getSnapshot().pending[0].operationId;
  await settled(store);
  assert.equal(store.getSnapshot().acknowledged.includes(confirmedId), true);
});
