import { googleConfigured, googleDataStatus } from "@/lib/integration-server";

export async function GET() {
  return Response.json({ google: { configured: googleConfigured(), ...(await googleDataStatus()) } }, { headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
}
