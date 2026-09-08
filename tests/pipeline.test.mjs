import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const requireDependency = createRequire(import.meta.url);
const env = { AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key", APP_ORIGIN: "http://localhost:3000" };
const cache = new Map();
let fetchMock;
function load(file) {
  const normalized = file.replaceAll("\\", "/");
  if (cache.has(normalized)) return cache.get(normalized);
  const source = fs.readFileSync(path.join(import.meta.dirname, "..", normalized), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, Buffer, URL, URLSearchParams, AbortSignal, AbortController, Request, Response, ReadableStream, TextEncoder, TextDecoder, process: { env }, fetch: (...args) => fetchMock(...args), require: (name) => {
    if (name.startsWith("./")) return load(path.join(path.dirname(normalized), `${name}.ts`));
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
    if (name === "next/headers") return { cookies: async () => ({}) };
    return requireDependency(name);
  } });
  cache.set(normalized, loaded.exports);
  return loaded.exports;
}
const { getAIProvider, AIError } = load("src/lib/ai-provider.ts");
const { executePipeline, readPipelineRequest } = load("src/lib/pipeline-engine.ts");
const { consumePipeline } = load("src/lib/pipeline-stream.ts");
const plan = { summary: "Owl drafts and Eagle reviews", steps: [{ agentId: "researcher", task: "Draft answer" }, { agentId: "reviewer", task: "Check answer" }] };
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAvsAAAAASUVORK5CYII=";
beforeEach(() => { env.AI_PROVIDER = "openai"; env.OPENAI_API_KEY = "test-key"; fetchMock = () => { throw new Error("Unexpected external request"); }; });

test("Pipeline executes specialists in order with prior work and images, then a final answer", async () => {
  const calls = [];
  const provider = { name: "test", generate: async (input) => { calls.push(input); return calls.length === 1 ? JSON.stringify(plan) : `deliverable-${calls.length}`; } };
  const updates = [];
  for await (const update of executePipeline(provider, "ช่วยสรุปภาพ", [{ dataUrl: png }], new AbortController().signal)) updates.push(update);
  assert.equal(calls.length, 4);
  assert.match(calls[2].context, /deliverable-2/);
  assert.match(calls[3].context, /deliverable-3/);
  assert.equal(calls[1].images[0].dataUrl, png);
  assert.equal(updates[0].steps[0].status, "Working");
  assert.equal(updates.at(-1).status, "Complete");
  assert.equal(updates.at(-1).finalResponse, "deliverable-4");
  assert.ok(updates.at(-1).steps.every((step) => step.status === "Complete"));
});
test("invalid or duplicate specialist plans never proceed to execution", async () => {
  for (const result of ["not JSON", JSON.stringify({ ...plan, steps: [{ agentId: "unknown", task: "Task" }] }), JSON.stringify({ ...plan, steps: [plan.steps[0], plan.steps[0]] })]) {
    let calls = 0;
    const updates = [];
    for await (const update of executePipeline({ name: "test", generate: async () => { calls++; return result; } }, "request", [], new AbortController().signal)) updates.push(update);
    assert.equal(calls, 1);
    assert.equal(updates.at(-1).status, "Failed");
    assert.equal(updates.at(-1).finalResponse, "");
  }
});
test("provider failure retains finished work and cancels remaining stages", async () => {
  let calls = 0;
  const provider = { name: "test", generate: async () => { if (++calls === 1) return JSON.stringify(plan); if (calls === 2) return "finished draft"; throw new AIError("quota exhausted", 429); } };
  const updates = [];
  for await (const update of executePipeline(provider, "request", [], new AbortController().signal)) updates.push(update);
  const final = updates.at(-1);
  assert.equal(final.status, "Failed");
  assert.equal(final.steps[1].output, "finished draft");
  assert.equal(final.steps[2].status, "Failed");
  assert.equal(final.steps[3].status, "Cancelled");
  assert.equal(final.finalResponse, "");
});
test("cancellation stops before calling another specialist", async () => {
  const abort = new AbortController();
  let calls = 0;
  const provider = { name: "test", generate: async () => { calls++; abort.abort(); return JSON.stringify(plan); } };
  const updates = [];
  for await (const update of executePipeline(provider, "request", [], abort.signal)) updates.push(update);
  assert.equal(calls, 1);
  assert.equal(updates.at(-1).status, "Cancelled");
});
test("OpenAI requests use the server key, structured plans, image inputs and no storage", async () => {
  fetchMock = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init.headers.Authorization, "Bearer test-key");
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.input[0].content[1].image_url, png);
    return Response.json({ status: "completed", output: [{ type: "reasoning" }, { content: [{ type: "output_text", text: "done" }] }] });
  };
  assert.equal(await getAIProvider().generate({ systemPrompt: "test", message: "request", images: [{ dataUrl: png }], schema: { type: "object" } }), "done");
});
test("missing key, API errors, refusals and incomplete responses cannot masquerade as success", async () => {
  env.OPENAI_API_KEY = "";
  assert.throws(() => getAIProvider(), /OPENAI_API_KEY/);
  env.OPENAI_API_KEY = "test-key";
  for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 429 }), Response.json({ status: "incomplete" }), Response.json({ status: "completed", output: [{ content: [{ type: "refusal", refusal: "no" }] }] })]) {
    fetchMock = async () => response;
    await assert.rejects(getAIProvider().generate({ systemPrompt: "test", message: "request" }));
  }
});
test("request validation rejects oversized text, remote image URLs and false image signatures", async () => {
  const make = (body) => new Request("http://localhost:3000", { method: "POST", body: JSON.stringify(body) });
  for (const body of [{ request: "" }, { request: "x".repeat(4001) }, { request: "x", images: [{ dataUrl: "https://evil.example/image" }] }, { request: "x", images: [{ dataUrl: "data:image/png;base64,aGVsbG8=" }] }]) await assert.rejects(readPipelineRequest(make(body)));
  assert.equal((await readPipelineRequest(make({ request: "image", images: [{ dataUrl: png }] }))).images.length, 1);
});
test("stream parser handles split Thai UTF-8 bytes and detects interrupted streams", async () => {
  const payload = { status: "Complete", finalResponse: "สวัสดี", steps: [], selectedAgents: [] };
  const bytes = new TextEncoder().encode(JSON.stringify(payload) + "\n");
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2)); controller.close(); } });
  let final;
  await consumePipeline(new Response(stream), (update) => { final = update; });
  assert.equal(final.finalResponse, "สวัสดี");
  await assert.rejects(consumePipeline(new Response(JSON.stringify({ ...payload, status: "Running" }) + "\n"), () => {}), /ขาด/);
});
test("Manual Pipeline blocks all old API requests without calling OpenAI", async () => {
  fetchMock = async () => { assert.fail("Manual mode must not call OpenAI"); };
  const route = load("src/app/api/pipeline/route.ts");
  assert.equal((await route.POST(new Request("http://localhost:3000/api/pipeline", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }))).status, 410);
  env.OPENAI_API_KEY = "";
  assert.equal((await route.POST(new Request("http://localhost:3000/api/pipeline", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{}" }))).status, 410);
  const status = await (await route.GET()).json();
  assert.equal(status.configured, false);
  assert.equal(JSON.stringify(status).includes("test-key"), false);
});
