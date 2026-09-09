import { cookies } from "next/headers";
import { authClient, requireOrigin, privateJson } from "@/lib/auth-server";
export async function POST(request: Request) {
  try { requireOrigin(request); } catch { return privateJson({ error: "Forbidden" }, 403); }
  try {
    const client = await authClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return privateJson({ error: "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่" }, 503);
    const jar = await cookies();
    for (const cookie of jar.getAll()) if (cookie.name.startsWith("amaris-auth") || cookie.name.startsWith("pai-google")) jar.delete(cookie.name);
    return privateJson({ ok: true });
  } catch { return privateJson({ error: "ออกจากระบบไม่สำเร็จ" }, 503); }
}
