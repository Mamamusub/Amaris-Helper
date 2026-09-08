import { accessToken, failure, IntegrationError, remoteFetch } from "@/lib/integration-server";

export async function GET() {
  try {
    const token = await accessToken();
    const calendars: { id: string; name: string; primary: boolean; selected: boolean }[] = [];
    let pageToken = "";
    let pages = 0;
    do {
      const query = new URLSearchParams({ maxResults: "250", minAccessRole: "reader", showHidden: "true", fields: "nextPageToken,items(id,summary,summaryOverride,primary,selected,deleted)" });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await remoteFetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? "ยังอ่านรายชื่อปฏิทินไม่ได้ ไป Settings → อัปเดตสิทธิ์ Google แล้วอนุญาตให้อ่านปฏิทินและกิจกรรม" : "โหลดรายชื่อปฏิทินไม่สำเร็จ กรุณาลองอีกครั้ง", response.status === 401 || response.status === 403 ? 401 : 502);
      const data = await response.json() as { nextPageToken?: string; items?: { id?: string; summary?: string; summaryOverride?: string; primary?: boolean; selected?: boolean; deleted?: boolean }[] };
      for (const item of data.items ?? []) {
        if (item.id && !item.deleted) calendars.push({ id: item.id, name: item.summaryOverride || item.summary || item.id, primary: Boolean(item.primary), selected: Boolean(item.selected) });
      }
      pageToken = data.nextPageToken ?? "";
      pages++;
    } while (pageToken && pages < 10);
    if (pageToken) throw new IntegrationError("มีปฏิทินจำนวนมากเกินกว่าจะโหลดครบ กรุณาลดจำนวนปฏิทินที่ติดตาม", 422);
    calendars.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
    return Response.json({ calendars }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
