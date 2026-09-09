import { googleConfigured, calendarRefresh } from "@/lib/integration-server";

export async function GET() {
  return Response.json({ google: { configured: googleConfigured(), connected: Boolean(await calendarRefresh()) } }, { headers: { "Cache-Control": "no-store" } });
}
