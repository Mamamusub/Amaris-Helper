import { cookies } from "next/headers";
import { googleConfigured, googleCookie, unseal } from "@/lib/integration-server";

export async function GET() {
  const jar = await cookies();
  return Response.json({ google: { configured: googleConfigured(), connected: Boolean(unseal(jar.get(googleCookie)?.value)) } }, { headers: { "Cache-Control": "no-store" } });
}
