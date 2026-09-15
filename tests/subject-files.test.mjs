import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";
import "fake-indexeddb/auto";
const require = createRequire(import.meta.url);
function load(file) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(module, exports, require) { ${compiled}\n})`)(mod, mod.exports, name => name.startsWith(".") ? load(path.join(path.dirname(file), name + ".ts")) : require(name));
  return mod.exports;
}
const mod = { exports: load("src/lib/subject-files.ts") };
const { fileKind, fileAsPdf } = mod.exports;
const { listSubjectFiles, saveSubjectFiles } = mod.exports;
const { listSubjectFolders, createSubjectFolder } = mod.exports;
const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")]);

test("account files upload bytes once, sync metadata without blobs, and download on a second device", async () => {
  const { uploadAccountFile, accountFileBlob } = load("src/lib/account-files.ts");
  const originalFetch = globalThis.fetch;
  const calls = [], changes = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url === "/api/files") return Response.json({ userId: "alice", path: "alice/file", signedUrl: "https://storage.test/upload" });
    if (url === "https://storage.test/upload") return Response.json({});
    if (url.startsWith("/api/files?")) return Response.json({ signedUrl: "https://storage.test/download" });
    return new Response(png);
  };
  const cloud = { userId: "alice", enqueue: (kind, value) => { changes.push({kind, value}); return true; } };
  try {
    const file = { id: "cv", name: "CV", size: png.size, createdAt: "2026-09-16", blob: png };
    const uploaded = await uploadAccountFile(cloud, "career", file);
    assert.equal(calls[1].init.body, png);
    assert.equal(changes[0].kind, "document");
    assert.equal(changes[0].value[0].item.blob, undefined);
    assert.equal(uploaded.ownerId, "alice");
    await uploadAccountFile(cloud, "career", { ...uploaded, name: "Updated CV" });
    assert.equal(calls.length, 2);
    const downloaded = await accountFileBlob({ ...uploaded, blob: new Blob() });
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), Buffer.from(await png.arrayBuffer()));
    assert.match(calls[2].url, /userId=alice/);
  } finally { globalThis.fetch = originalFetch; }
});

test("failed upload never queues a completed file record", async () => {
  const { uploadAccountFile } = load("src/lib/account-files.ts");
  const originalFetch = globalThis.fetch;
  let queued = false;
  globalThis.fetch = async () => Response.json({ error: "Storage unavailable" }, { status: 503 });
  try {
    await assert.rejects(uploadAccountFile({ userId: "alice", enqueue: () => { queued = true; } }, "career", { id: "failed", name: "CV", size: png.size, createdAt: "today", blob: png }), /Storage unavailable/);
    assert.equal(queued, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("guest file migration copies originals, keeps account boundaries and never revives removed metadata", async () => {
  const { importGuestFiles, syncLocalFiles } = load("src/lib/file-migration.ts");
  const { saveStoredFile, getStoredFiles } = load("src/lib/exam-files.ts");
  const originalFetch = globalThis.fetch;
  let uploads = 0;
  globalThis.fetch = async url => url === "/api/files"
    ? Response.json({ userId: "migration-owner", path: `migration-owner/${++uploads}`, signedUrl: "https://storage.test/upload" })
    : Response.json({});
  const records = [];
  const cloud = {
    userId: "migration-owner", key: "amaris.account.migration-owner",
    getSnapshot: () => ({ records, pending: [] }),
    import(rows) { for (const row of rows) if (!records.some(old => old.id === row.id)) records.push({ ...row, version: 1 }); return true; },
    enqueue(kind, values) { for (const data of values) if (!records.some(old => old.id === data.id)) records.push({ kind, id: data.id, data, version: 1 }); return true; },
  };
  try {
    await saveSubjectFiles([{ id: "guest-file", scope: "local", subjectId: "math", subjectName: "Math", name: "Notes", kind: "png", size: png.size, createdAt: "2026-09-16", blob: png }]);
    await saveStoredFile({ id: "guest-exam", subjectId: "math", name: "Exam.png", type: "image/png", size: png.size, createdAt: "2026-09-16", blob: png });
    await importGuestFiles(cloud);
    assert.ok((await listSubjectFiles("local")).some(file => file.id === "guest-file"));
    assert.ok((await getStoredFiles()).some(file => file.id === "guest-exam"));
    assert.ok((await listSubjectFiles(cloud.key)).some(file => file.id === "import-guest-file"));
    assert.equal((await getStoredFiles("amaris.account.other")).length, 0);
    await syncLocalFiles(cloud);
    const uploaded = uploads;
    assert.ok(records.some(row => row.id === "file:study:import-guest-file"));
    const removed = records.find(row => row.id === "file:exam:import-guest-exam");
    removed.data = { id: removed.id, area: "exam", category: "file", deletedAt: "today" };
    await importGuestFiles(cloud); await syncLocalFiles(cloud);
    assert.equal(uploads, uploaded);
    assert.equal(removed.data.deletedAt, "today");
  } finally { globalThis.fetch = originalFetch; }
});
test("file import identifies actual content and rejects unsupported files", async () => {
  assert.equal(await fileKind(png), "png");
  assert.equal(await fileKind(new Blob(["%PDF-1.7\n"])), "pdf");
  await assert.rejects(fileKind(new Blob(["not a PDF"], { type: "application/pdf" })));
  await assert.rejects(fileKind(new Blob([])));
});
test("PDF export preserves the complete original document byte for byte", async () => {
  const original = await PDFDocument.create(); original.addPage(); original.addPage();
  const blob = new Blob([await original.save()]);
  const result = await fileAsPdf({ kind: "pdf", blob });
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), new Uint8Array(await blob.arrayBuffer()));
  assert.equal((await PDFDocument.load(await result.arrayBuffer())).getPageCount(), 2);
});
test("PNG export produces a readable A4 PDF with an embedded image", async () => {
  const result = await fileAsPdf({ kind: "png", blob: png });
  assert.equal(result.type, "application/pdf");
  const doc = await PDFDocument.load(await result.arrayBuffer());
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 595.28, height: 841.89 });
  assert.ok(doc.getPage(0).node.Resources().get(require("pdf-lib").PDFName.of("XObject")));
  await assert.rejects(fileAsPdf({ kind: "png", blob: new Blob(["broken"]) }));
});
test("IndexedDB retains files in separate subjects and accounts and renames without changing their bytes", async () => {
  const base = { scope: "account-a", subjectId: "math", subjectName: "Math", name: "Notes", kind: "png", size: png.size, createdAt: new Date().toISOString(), blob: png };
  await saveSubjectFiles([{ ...base, id: "a" }, { ...base, id: "b", subjectId: "physics" }, { ...base, id: "c", scope: "account-b" }]);
  const first = await listSubjectFiles("account-a");
  assert.deepEqual(first.map((f) => f.subjectId).sort(), ["math", "physics"]);
  assert.equal((await listSubjectFiles("account-b")).length, 1);
  const file = first.find((f) => f.id === "a");
  await saveSubjectFiles([{ ...file, name: "Chapter 2" }]);
  const reloaded = await listSubjectFiles("account-a");
  assert.equal(reloaded.length, 2);
  assert.equal(reloaded.find((f) => f.id === "a").name, "Chapter 2");
  assert.deepEqual(new Uint8Array(await reloaded.find((f) => f.id === "a").blob.arrayBuffer()), new Uint8Array(await png.arrayBuffer()));
  assert.equal((await listSubjectFiles("account-b"))[0].name, "Notes");
});
test("subfolders persist nested paths, isolate accounts and subjects, and reject duplicate or invalid parents", async () => {
  const base = { scope: "folders-test", subjectId: "math", subjectName: "Math", parentId: null, name: "Chapter 1", createdAt: new Date().toISOString() };
  await createSubjectFolder({ ...base, id: "folder-root" });
  await createSubjectFolder({ ...base, id: "folder-child", parentId: "folder-root", name: "Exercises" });
  await assert.rejects(createSubjectFolder({ ...base, id: "duplicate", name: " chapter 1 " }), /มีโฟลเดอร์/);
  await assert.rejects(createSubjectFolder({ ...base, id: "invalid", parentId: "missing" }), /ไม่พบ/);
  await assert.rejects(createSubjectFolder({ ...base, id: "foreign", scope: "other", parentId: "folder-root" }), /ไม่พบ/);
  await assert.rejects(createSubjectFolder({ ...base, id: "foreign-subject", subjectId: "physics", parentId: "folder-root" }), /ไม่พบ/);
  await createSubjectFolder({ ...base, id: "physics-folder", subjectId: "physics" });
  const directories = await listSubjectFolders(base.scope);
  assert.equal(directories.length, 3);
  assert.equal(directories.find((f) => f.id === "folder-child").parentId, "folder-root");
  assert.equal((await listSubjectFolders("other")).length, 0);
  const file = { id: "nested-file", scope: base.scope, subjectId: "math", subjectName: "Math", folderId: "folder-child", name: "Exercise", kind: "png", size: png.size, createdAt: base.createdAt, blob: png };
  await saveSubjectFiles([file, { ...file, id: "legacy-file", folderId: undefined }]);
  const reloaded = await listSubjectFiles(base.scope);
  assert.equal(reloaded.find((f) => f.id === file.id).folderId, "folder-child");
  assert.equal(reloaded.find((f) => f.id === "legacy-file").folderId ?? null, null);
});
