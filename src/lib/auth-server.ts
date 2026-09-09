import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const authConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.APP_ORIGIN);
export function origin() { return new URL(process.env.APP_ORIGIN || "http://localhost:3000").origin; }
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== origin()) throw new Error("Forbidden origin");
}
export async function authClient() {
  if (!authConfigured()) throw new Error("Authentication is not configured");
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { name: "amaris-auth", httpOnly: true, secure: origin().startsWith("https:"), sameSite: "lax", path: "/" },
    cookies: { getAll: () => jar.getAll(), setAll: (items) => { for (const { name, value, options } of items) jar.set(name, value, { ...options, httpOnly: true, secure: origin().startsWith("https:"), sameSite: "lax", path: "/" }); } },
  });
}
export async function verifiedAccount() {
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  if (error && (error.status === undefined || error.status === 0 || error.status >= 500 || error.name === "AuthRetryableFetchError")) throw new Error("Authentication service unavailable");
  return { client, user: error ? null : data.user };
}
export function privateJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
