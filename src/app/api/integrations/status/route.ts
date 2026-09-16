import { googleConfigured, googleDataStatus, IntegrationError } from "@/lib/integration-server";

export async function GET() {
  try {
    return Response.json({ google: { configured: googleConfigured(), ...(await googleDataStatus()) } }, { headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
  } catch (error) {
    return Response.json({ error: error instanceof IntegrationError ? error.message : "ตรวจการเชื่อมต่อ Google ไม่สำเร็จ ตรวจ Supabase migration และ session แล้วลองใหม่" }, { status: 503, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
  }
}
