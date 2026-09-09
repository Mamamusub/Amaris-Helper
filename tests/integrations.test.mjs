import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);

const jar = new Map();
const cookieStore = { get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key, value) => jar.set(key, value), delete: (key) => jar.delete(key) };
const env = { ...process.env, APP_ORIGIN: "http://localhost:3000", GOOGLE_CLIENT_ID: "test-id", GOOGLE_CLIENT_SECRET: "test-client-secret", INTEGRATION_SECRET: "x".repeat(64) };
let mockFetch;
let accountId = null;
const cache = new Map();
function load(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath);
  const source = fs.readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  const context = { module: testModule, exports: testModule.exports, Buffer, URL, URLSearchParams, Request, Response, AbortSignal, process: { env }, fetch: (...args) => mockFetch(...args), require: (name) => name === "./auth-server" ? { authConfigured: () => !!accountId, verifiedAccount: async () => ({ user: accountId ? { id: accountId } : null }) } : name === "next/headers" ? { cookies: async () => cookieStore } : name === "@/lib/integration-server" ? load("src/lib/integration-server.ts") : nodeRequire(name) };
  vm.runInNewContext(compiled, context, { filename: relativePath });
  cache.set(relativePath, testModule.exports);
  return testModule.exports;
}
const helpers = load("src/lib/integration-server.ts");
const task = { id: "task-1", title: "Review notes", description: "@everyone study", deadline: "2026-12-31", team: "Study", priority: "High" };
const request = (body = task, origin = env.APP_ORIGIN) => new Request(`${env.APP_ORIGIN}/api/integrations`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { accountId = null; jar.clear(); mockFetch = () => { throw new Error("Unexpected external request"); }; });

test("encrypted credentials round-trip and reject tampering", () => {
  const sealed = helpers.seal("private-refresh-token");
  assert.equal(helpers.unseal(sealed), "private-refresh-token");
  const bytes = Buffer.from(sealed, "base64url"); bytes[15] ^= 1;
  assert.equal(helpers.unseal(bytes.toString("base64url")), null);
  assert.equal(helpers.unseal("invalid"), null);
});
test("task validation rejects impossible dates and oversized titles", async () => {
  await assert.rejects(helpers.readTask(request({ ...task, deadline: "2026-02-30" })));
  await assert.rejects(helpers.readTask(request({ ...task, title: "x".repeat(201) })));
  await assert.rejects(helpers.readTask(request(null)));
});
test("all-day end date is exclusive and event IDs remain stable", () => {
  const event = helpers.calendarEvent(task);
  assert.equal(event.end.date, "2027-01-01");
  assert.equal(event.id, helpers.calendarEvent({ ...task, title: "Edited" }).id);
  assert.match(event.id, /^[0-9a-v]{5,1024}$/);
});
test("all mutation endpoints reject foreign origins before sending anything", async () => {
  for (const file of ["google/connect", "google/disconnect", "google/events"]) {
    const result = await load(`src/app/api/integrations/${file}/route.ts`).POST(request(task, "https://evil.example"));
    assert.equal(result.status, 403);
  }
});
test("OAuth callback rejects mismatched state without exchanging a token", async () => {
  jar.set(helpers.stateCookie, "expected");
  const result = await load("src/app/api/integrations/google/callback/route.ts").GET(new Request(`${env.APP_ORIGIN}/api/integrations/google/callback?state=wrong&code=secret`));
  assert.match(result.headers.get("location"), /calendar=failed/);
  assert.equal(jar.has(helpers.stateCookie), false);
  assert.equal(jar.has(helpers.googleCookie), false);
});
test("OAuth callback stores only encrypted refresh credentials", async () => {
  jar.set(helpers.stateCookie, "expected");
  mockFetch = async () => Response.json({ access_token: "access", refresh_token: "refresh", scope: helpers.calendarScope });
  const result = await load("src/app/api/integrations/google/callback/route.ts").GET(new Request(`${env.APP_ORIGIN}/api/integrations/google/callback?state=expected&code=secret`));
  assert.match(result.headers.get("location"), /calendar=connected/);
  assert.equal(helpers.unseal(jar.get(helpers.googleCookie)), "refresh");
  assert.notEqual(jar.get(helpers.googleCookie), "refresh");
});
test("Calendar requires a connected browser", async () => {
  assert.equal((await load("src/app/api/integrations/google/events/route.ts").POST(request())).status, 401);
});
test("Calendar refreshes access and treats duplicate events as success", async () => {
  jar.set(helpers.googleCookie, helpers.seal("refresh"));
  let calls = 0;
  mockFetch = async (url, options) => {
    calls++;
    if (url.includes("oauth2")) return Response.json({ access_token: "access" });
    assert.equal(options.headers.Authorization, "Bearer access");
    assert.equal(JSON.parse(options.body).start.date, task.deadline);
    return new Response(null, { status: 409 });
  };
  const response = await load("src/app/api/integrations/google/events/route.ts").POST(request());
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /already/);
  assert.equal(calls, 2);
});
test("status never exposes credentials", async () => {
  jar.set(helpers.googleCookie, helpers.seal("private-refresh-token"));
  const data = await (await load("src/app/api/integrations/status/route.ts").GET()).json();
  assert.deepEqual(data, { google: { configured: true, connected: true } });
});

const calendar = load("src/lib/calendar.ts");
test("calendar handles leap years, Monday grids, and month boundaries", () => {
  const days = calendar.monthDays("2028-02");
  assert.equal(days.length, 42);
  assert.equal(new Date(days[0]).getUTCDay(), 1);
  assert.ok(days.includes("2028-02-29"));
  assert.equal(calendar.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(calendar.shiftMonth("2026-01", -1), "2025-12");
});
test("calendar preserves all-day dates and handles exclusive ends", () => {
  const event = { id: "all-day", start: "2026-09-08", end: "2026-09-11", allDay: true };
  assert.equal(calendar.eventDays(event).last, "2026-09-10");
  assert.equal(calendar.eventDeadline(event), "2026-09-10");
});
test("timed events use Bangkok date and exclude a midnight end", () => {
  const event = { id: "timed", start: "2026-09-08T18:00:00Z", end: "2026-09-09T17:00:00Z", allDay: false };
  assert.equal(calendar.eventDays(event).first, "2026-09-09");
  assert.equal(calendar.eventDays(event).last, "2026-09-09");
  assert.equal(calendar.eventDeadline(event), "2026-09-09");
  assert.equal(calendar.eventTaskId("recurring_20260909"), "google-primary:recurring_20260909");
});
test("calendar listing validates its range before accessing Google", async () => {
  const route = load("src/app/api/integrations/google/events/route.ts");
  for (const query of ["", "from=2026-02-30&to=2026-03-03", "from=2026-01-01&to=2026-12-31", "from=2026-09-10&to=2026-09-08"]) {
    assert.equal((await route.GET(new Request(`${env.APP_ORIGIN}/api/integrations/google/events?${query}`))).status, 400);
  }
  assert.equal((await route.GET(new Request(`${env.APP_ORIGIN}/api/integrations/google/events?from=2026-09-01&to=2026-10-01`))).status, 401);
});
test("calendar listing follows pagination, expands recurrence and omits cancelled events", async () => {
  jar.set(helpers.googleCookie, helpers.seal("refresh"));
  let pages = 0;
  mockFetch = async (url) => {
    if (url.includes("oauth2")) return Response.json({ access_token: "access" });
    const query = new URL(url).searchParams;
    assert.equal(query.get("singleEvents"), "true");
    assert.equal(query.get("timeMin"), "2026-09-01T00:00:00+07:00");
    if (++pages === 1) return Response.json({ nextPageToken: "next", items: [{ id: "a", summary: "Assignment", start: { date: "2026-09-08" }, end: { date: "2026-09-09" }, htmlLink: "javascript:alert(1)" }, { id: "deleted", status: "cancelled", start: { date: "2026-09-08" }, end: { date: "2026-09-09" } }] });
    assert.equal(query.get("pageToken"), "next");
    return Response.json({ items: [{ id: "b_20260909", summary: "Recurring assignment", start: { dateTime: "2026-09-09T10:00:00+07:00" }, end: { dateTime: "2026-09-09T11:00:00+07:00" } }] });
  };
  const response = await load("src/app/api/integrations/google/events/route.ts").GET(new Request(`${env.APP_ORIGIN}/api/integrations/google/events?from=2026-09-01&to=2026-10-01`));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.events.length, 2);
  assert.equal(data.events[0].url, undefined);
  assert.equal(data.events[1].allDay, false);
  assert.equal(data.timeZone, "Asia/Bangkok");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
test("Google read failures are reported without pretending the calendar is empty", async () => {
  jar.set(helpers.googleCookie, helpers.seal("refresh"));
  mockFetch = async (url) => url.includes("oauth2") ? Response.json({ access_token: "access" }) : new Response(null, { status: 503 });
  const response = await load("src/app/api/integrations/google/events/route.ts").GET(new Request(`${env.APP_ORIGIN}/api/integrations/google/events?from=2026-09-01&to=2026-10-01`));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Could not load/);
});

test("Google connect requests read access for subscribed calendars and account selection", async () => {
  const response = await load("src/app/api/integrations/google/connect/route.ts").POST(request());
  const url = new URL((await response.json()).url);
  const scopes = url.searchParams.get("scope").split(" ");
  assert.ok(scopes.includes(helpers.calendarReadScope));
  assert.ok(scopes.includes(helpers.calendarListScope));
  assert.match(url.searchParams.get("prompt"), /select_account/);
});
test("calendar list includes subscribed Classroom calendars across pages", async () => {
  jar.set(helpers.googleCookie, helpers.seal("refresh"));
  let pages = 0;
  mockFetch = async (url) => {
    if (url.includes("oauth2")) return Response.json({ access_token: "access" });
    const query = new URL(url).searchParams;
    assert.equal(query.get("minAccessRole"), "reader");
    assert.equal(query.get("showHidden"), "true");
    if (++pages === 1) return Response.json({ nextPageToken: "next", items: [{ id: "pai@example.com", summary: "Pai", primary: true }] });
    assert.equal(query.get("pageToken"), "next");
    return Response.json({ items: [{ id: "classroom@group.calendar.google.com", summary: "Classroom Assignments", selected: true }, { id: "removed", deleted: true }] });
  };
  const response = await load("src/app/api/integrations/google/calendars/route.ts").GET();
  assert.equal(response.status, 200);
  const { calendars } = await response.json();
  assert.equal(calendars.length, 2);
  assert.equal(calendars[0].primary, true);
  assert.equal(calendars[1].name, "Classroom Assignments");
});
test("old Google permissions explain how to enable other calendars", async () => {
  jar.set(helpers.googleCookie, helpers.seal("refresh"));
  mockFetch = async (url) => url.includes("oauth2") ? Response.json({ access_token: "access" }) : new Response(null, { status: 403 });
  const response = await load("src/app/api/integrations/google/calendars/route.ts").GET();
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /อัปเดตสิทธิ์ Google/);
});
test("events use the selected Classroom calendar and distinct import IDs", async () => {
  jar.set(helpers.googleCookie, helpers.seal("refresh"));
  const calendarId = "classroom@group.calendar.google.com";
  mockFetch = async (url) => {
    if (url.includes("oauth2")) return Response.json({ access_token: "access" });
    assert.equal(new URL(url).pathname, `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    return Response.json({ items: [{ id: "assignment-1", summary: "Due today", start: { date: "2026-09-08" }, end: { date: "2026-09-09" } }] });
  };
  const query = new URLSearchParams({ from: "2026-09-01", to: "2026-10-01", calendarId });
  const response = await load("src/app/api/integrations/google/events/route.ts").GET(new Request(`${env.APP_ORIGIN}/api/integrations/google/events?${query}`));
  assert.equal(response.status, 200);
  const { events } = await response.json();
  assert.equal(events[0].calendarId, calendarId);
  assert.notEqual(events[0].id, "assignment-1");
  assert.equal(events[0].start, "2026-09-08");
});

test("Calendar credentials are bound to the verified login account", async () => {
  accountId = "alice";
  jar.set(helpers.googleCookie, helpers.seal(JSON.stringify({ owner: "alice", refresh: "alice-refresh" })));
  assert.equal(await helpers.calendarRefresh(), "alice-refresh");
  accountId = "bob"; assert.equal(await helpers.calendarRefresh(), null);
  accountId = null; assert.equal(await helpers.calendarRefresh(), null);
  jar.set(helpers.googleCookie, helpers.seal("legacy-local-refresh"));
  assert.equal(await helpers.calendarRefresh(), "legacy-local-refresh");
  accountId = "alice"; assert.equal(await helpers.calendarRefresh(), null);
});

test("Calendar callback rejects an account switch during consent", async () => {
  accountId = "bob";
  jar.set(helpers.stateCookie, "valid-state");
  jar.set("pai-google-owner", helpers.seal("alice"));
  const route = load("src/app/api/integrations/google/callback/route.ts");
  const result = await route.GET(new Request(`${env.APP_ORIGIN}/api/integrations/google/callback?state=valid-state&code=test`));
  assert.match(result.headers.get("location"), /calendar=failed/);
  assert.equal(jar.has(helpers.googleCookie), false);
});
