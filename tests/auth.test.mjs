import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function fixture() {
  const jar = new Map([["pai-google", "old-calendar"]]);
  const cookieOptions = [];
  let currentUser = { id: "verified-id", email: "user@example.test" };
  let authError = null;
  let oauthOptions;
  let rpcArgs;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: currentUser }, error: authError }),
      signInWithOAuth: async (options) => { oauthOptions = options; return { data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" } }; },
      exchangeCodeForSession: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
    rpc: async (...args) => { rpcArgs = args; return { data: [] }; },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const loadedModule = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(source, { module: loadedModule, exports: loadedModule.exports, URL, Response, process: { env: { APP_ORIGIN: "https://amarishelper.vercel.app", SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" } }, require(name) {
      if (name === "@supabase/ssr") return { createServerClient: (_url, _key, options) => { options.cookies.setAll([{ name: "amaris-auth", value: "server-token", options: {} }]); return client; } };
      if (name === "next/headers") return { cookies: async () => ({ getAll: () => [...jar].map(([name, value]) => ({ name, value })), set(name, value, options) { jar.set(name, value); cookieOptions.push(options); }, delete: (name) => jar.delete(name) }) };
      return load(`src/${name.slice(2)}.ts`);
    } });
    cache.set(file, loadedModule.exports); return loadedModule.exports;
  }
  return { load, jar, cookieOptions, get oauthOptions() { return oauthOptions; }, get rpcArgs() { return rpcArgs; }, anonymous() { currentUser = null; }, unavailable() { authError = { status: 503 }; } };
}
const request = (path, body, origin = "https://amarishelper.vercel.app") => new Request(`https://amarishelper.vercel.app${path}`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
test("login requests Google identity only, uses its own PKCE callback and HttpOnly cookies", async () => {
  const f = fixture(); const route = f.load("src/app/api/auth/login/route.ts");
  assert.equal((await route.POST(request("/api/auth/login", {}, "https://attacker.test"))).status, 403);
  const response = await route.POST(request("/api/auth/login", {})); assert.equal(response.status, 200);
  assert.equal(f.oauthOptions.provider, "google"); assert.equal(f.oauthOptions.options.redirectTo, "https://amarishelper.vercel.app/api/auth/callback");
  assert.equal(f.oauthOptions.options.scopes, undefined);
  assert.ok(f.cookieOptions.every((options) => options.httpOnly && options.secure && options.sameSite === "lax"));
});
test("session response contains identity only and an auth outage is not a logout", async () => {
  const f = fixture(); const route = f.load("src/app/api/auth/session/route.ts");
  const response = await route.GET(); assert.deepEqual(await response.json(), { configured: true, user: { id: "verified-id", email: "user@example.test" } });
  assert.match(response.headers.get("cache-control"), /no-store/);
  f.unavailable(); assert.equal((await route.GET()).status, 503);
});
test("workspace API rejects anonymous, foreign-origin and switched-account requests", async () => {
  const f = fixture(); const route = f.load("src/app/api/workspace/route.ts");
  const body = { userId: "spoofed", operationId: "operation", changes: [] };
  assert.equal((await route.POST(request("/api/workspace", body))).status, 401); assert.equal(f.rpcArgs, undefined);
  assert.equal((await route.POST(request("/api/workspace", body, "https://attacker.test"))).status, 403);
  assert.equal((await route.POST(request("/api/workspace", { ...body, userId: "verified-id" }))).status, 200);
  assert.equal(f.rpcArgs[1].user_id, undefined);
  f.anonymous(); assert.equal((await route.GET()).status, 401);
});
test("successful login clears prior Calendar binding and logout clears private cookies", async () => {
  const f = fixture(); const callback = f.load("src/app/api/auth/callback/route.ts");
  const response = await callback.GET(new Request("https://amarishelper.vercel.app/api/auth/callback?code=pkce-code"));
  assert.equal(response.headers.get("location"), "https://amarishelper.vercel.app/?login=success"); assert.equal(f.jar.has("pai-google"), false);
  const logout = f.load("src/app/api/auth/logout/route.ts"); assert.equal((await logout.POST(request("/api/auth/logout", {}))).status, 200); assert.equal(f.jar.has("amaris-auth"), false);
});
