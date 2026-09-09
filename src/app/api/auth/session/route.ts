import { authConfigured, verifiedAccount, privateJson } from "@/lib/auth-server";
export async function GET() {
  if (!authConfigured()) return privateJson({ configured: false, user: null });
  try { const { user } = await verifiedAccount(); return privateJson({ configured: true, user: user ? { id: user.id, email: user.email } : null }); }
  catch { return privateJson({ error: "ตรวจสอบบัญชีไม่ได้ กรุณาลองใหม่" }, 503); }
}
