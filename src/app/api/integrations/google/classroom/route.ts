import { classroomAssignments } from "@/lib/classroom-server";
import { failure, IntegrationError } from "@/lib/integration-server";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
    if (!valid(from) || !valid(to) || to <= from || Date.parse(to) - Date.parse(from) > 62 * 86400000) throw new IntegrationError("Choose a valid range of up to 62 days.");
    return Response.json({ events: await classroomAssignments(from, to), timeZone: "Asia/Bangkok" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
