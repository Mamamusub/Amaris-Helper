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
