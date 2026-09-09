import { authClient, origin, privateJson, requireOrigin } from "@/lib/auth-server";
export async function POST(request: Request) {
  try { requireOrigin(request); } catch { return privateJson({ error: "Forbidden" }, 403); }
  try {
    const client = await authClient();
    const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin()}/api/auth/callback`, skipBrowserRedirect: true } });
    if (error || !data.url) throw new Error("Login unavailable");
    return privateJson({ url: data.url });
  } catch { return privateJson({ error: "ยังไม่ได้ตั้งค่า Google Login หรือเชื่อมต่อไม่ได้" }, 503); }
}
