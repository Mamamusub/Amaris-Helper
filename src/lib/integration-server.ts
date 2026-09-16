import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { authConfigured, verifiedAccount } from "./auth-server";
export { authConfigured } from "./auth-server";

export async function calendarOwner() {
  if (!authConfigured()) return null;
  return (await verifiedAccount()).user?.id ?? null;
}
export async function calendarRefresh() {
  const raw = unseal((await cookies()).get(googleCookie)?.value);
  if (!raw) return null;
  const owner = await calendarOwner();
  if (authConfigured() && !owner) return null;
  if (!raw.startsWith("{")) return owner ? null : raw;
  try { const saved = JSON.parse(raw); return saved.owner === owner && typeof saved.refresh === "string" ? saved.refresh : null; } catch { return null; }
}
export const googleCookie = "pai-google";
export const stateCookie = "pai-google-state";
export const calendarScope = "https://www.googleapis.com/auth/calendar.events.owned";
export const calendarReadScope = "https://www.googleapis.com/auth/calendar.events.readonly";
export const calendarListScope = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const googleSheetsScope = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const classroomCoursesScope = "https://www.googleapis.com/auth/classroom.courses.readonly";
export const classroomWorkScope = "https://www.googleapis.com/auth/classroom.coursework.me.readonly";
export const googleEmailScope = "https://www.googleapis.com/auth/userinfo.email";
export const googleScopes = [calendarScope, calendarReadScope, calendarListScope, googleSheetsScope].join(" ");
export const googleCoreScopes = [calendarReadScope, calendarListScope, googleEmailScope];
export const googleClassroomScopes = [classroomCoursesScope, classroomWorkScope];
const configuredOrigin = () => process.env.APP_ORIGIN?.trim() ? new URL(process.env.APP_ORIGIN).origin : null;
const requestOrigin = (request?: Request) => {
  if (!request) return null;
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return new URL(`${forwardedProto || new URL(request.url).protocol.replace(":", "")}://${forwardedHost}`).origin;
  return new URL(request.url).origin;
};
export const appOrigin = (request?: Request) => configuredOrigin() ?? requestOrigin(request) ?? "http://localhost:3000";
export const callbackUrl = (request?: Request) => `${appOrigin(request)}/api/integrations/google/callback`;
export const cookieOptions = (request?: Request) => ({ httpOnly: true, sameSite: "lax" as const, secure: appOrigin(request).startsWith("https:"), path: "/", maxAge: 60 * 60 * 24 * 30 });

export class IntegrationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && (process.env.INTEGRATION_SECRET?.length ?? 0) >= 32);
}

function key() {
  if (!googleConfigured()) throw new IntegrationError("Set up Google Calendar in .env.local first.", 503);
  return createHash("sha256").update(process.env.INTEGRATION_SECRET!).digest();
}

export function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function unseal(value?: string) {
  if (!value) return null;
  try {
    const data = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  } catch { return null; }
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const trusted = [requestOrigin(request), configuredOrigin()].filter(Boolean);
  if (!origin || !trusted.includes(origin)) throw new IntegrationError("Request origin is not allowed.", 403);
}

export function failure(error: unknown) {
  return Response.json({ error: error instanceof IntegrationError ? error.message : "Connection failed. Please try again." }, { status: error instanceof IntegrationError ? error.status : 502 });
}

export async function remoteFetch(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
}

export async function googleToken(params: Record<string, string>) {
  if (!googleConfigured()) throw new IntegrationError("Set up Google Calendar in .env.local first.", 503);
  const response = await remoteFetch("https://oauth2.googleapis.com/token", {
    method: "POST", body: new URLSearchParams({ ...params, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET! }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (data.error === "invalid_grant") throw new IntegrationError("Google authorization expired or was declined. Reconnect in Settings.", 401);
    throw new IntegrationError("Google token refresh failed. Check OAuth setup or try again shortly.", 502);
  }
  return response.json() as Promise<{ access_token: string; refresh_token?: string; scope?: string }>;
}

type GoogleDataConnection = { google_email: string; refresh_token: string; scopes: string[] };

async function signedInGoogleConnection(): Promise<GoogleDataConnection | null> {
  if (!authConfigured()) return null;
  const { client, user } = await verifiedAccount();
  if (!user) return null;
  const { data, error } = await client.rpc("google_data_connection");
  if (error) throw new IntegrationError("อ่านการเชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่", 503);
  const row = (Array.isArray(data) ? data[0] : data) as { google_email?: unknown; refresh_token?: unknown; scopes?: unknown } | undefined;
  if (!row || typeof row.google_email !== "string" || typeof row.refresh_token !== "string" || !Array.isArray(row.scopes)) return null;
  const refresh = unseal(row.refresh_token);
  if (!refresh) throw new IntegrationError("ข้อมูลการเชื่อมต่อ Google เสียหาย กรุณาเชื่อมบัญชีใหม่", 401);
  return { google_email: row.google_email, refresh_token: refresh, scopes: row.scopes.filter((scope): scope is string => typeof scope === "string") };
}

export async function googleDataStatus() {
  return { connected: Boolean(await calendarRefresh()) };
}

export async function googleDataScopes() {
  if (!authConfigured()) return googleClassroomScopes;
  const connection = await signedInGoogleConnection();
  return connection?.scopes ?? [];
}

export async function saveGoogleDataConnection(email: string, refresh: string, scopes: string[]) {
  const { client, user } = await verifiedAccount();
  if (!user) throw new IntegrationError("เข้าสู่ระบบ Amaris ก่อนเชื่อม Google", 401);
  const { error } = await client.rpc("google_data_upsert", { account_email: email, encrypted_refresh: seal(refresh), granted_scopes: scopes });
  if (error) throw new IntegrationError("บันทึกการเชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่", 503);
}

export async function deleteGoogleDataConnection() {
  const { client, user } = await verifiedAccount();
  if (!user) throw new IntegrationError("เข้าสู่ระบบ Amaris ก่อนจัดการ Google", 401);
  const { data, error } = await client.rpc("google_data_delete");
  if (error) throw new IntegrationError("อ่านการเชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่", 503);
  return typeof data === "string" ? unseal(data) : null;
}

async function refreshAccessToken(refresh: string, clear: () => Promise<void>) {
  try { return (await googleToken({ grant_type: "refresh_token", refresh_token: refresh })).access_token; }
  catch (error) { if (error instanceof IntegrationError && error.status === 401) await clear(); throw error; }
}

export async function accessToken() {
  return legacyAccessToken();
}

export async function legacyAccessToken() {
  const jar = await cookies();
  const refresh = await calendarRefresh();
  if (!refresh) throw new IntegrationError("Connect Google Calendar in Settings first.", 401);
  return refreshAccessToken(refresh, async () => { jar.delete(googleCookie); });
}

export async function googleEmail(access: string) {
  const response = await remoteFetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${access}` } });
  if (!response.ok) throw new IntegrationError("ระบุอีเมลบัญชี Google ไม่สำเร็จ กรุณาลองเชื่อมใหม่", 502);
  const data = await response.json() as { email?: string };
  if (!data.email || data.email.length > 320) throw new IntegrationError("Google ไม่ได้ส่งอีเมลของบัญชีที่เชื่อมต่อ", 502);
  return data.email;
}

export type ExportTask = { id: string; title: string; description: string; deadline: string; team: string; priority: string };

export async function readTask(request: Request): Promise<ExportTask> {
  if (Number(request.headers.get("content-length")) > 16000) throw new IntegrationError("Task is too large.", 413);
  const raw = await request.text();
  if (raw.length > 16000) throw new IntegrationError("Task is too large.", 413);
  let task: ExportTask;
  try { task = JSON.parse(raw); } catch { throw new IntegrationError("Invalid task."); }
  if (!task || typeof task !== "object") throw new IntegrationError("Invalid task.");
  const limits = { id: 150, title: 200, description: 2000, deadline: 10, team: 50, priority: 20 } as const;
  for (const [field, limit] of Object.entries(limits)) {
    const value = task[field as keyof ExportTask];
    if (typeof value !== "string" || value.length > limit) throw new IntegrationError("Invalid task fields.");
  }
  const date = new Date(`${task.deadline}T00:00:00Z`);
  if (!task.id || !task.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(task.deadline) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== task.deadline) throw new IntegrationError("Task needs a title and a valid deadline.");
  return task;
}

export function calendarEvent(task: ExportTask) {
  const end = new Date(`${task.deadline}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    // A stable Google-compatible ID prevents duplicate events when a request is retried.
    id: createHash("sha256").update(`pai-task:${task.id}`).digest("hex"),
    summary: task.title,
    description: `${task.description}\n\nPai's workspace · ${task.team} · ${task.priority} priority`,
    start: { date: task.deadline }, end: { date: end.toISOString().slice(0, 10) },
  };
}
