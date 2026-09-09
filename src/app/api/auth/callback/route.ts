import { cookies } from "next/headers";
import { authClient, origin } from "@/lib/auth-server";
export async function GET(request: Request) {
  let success = false;
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    try {
      const client = await authClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      success = !error;
      if (success) { const jar = await cookies(); jar.delete("pai-google"); jar.delete("pai-google-state"); jar.delete("pai-google-owner"); }
    } catch { /* Never return or log codes/tokens. */ }
  }
  return Response.redirect(`${origin()}/?login=${success ? "success" : "failed"}`, 303);
}
