import { accessToken, calendarEvent, checkOrigin, failure, IntegrationError, readTask, remoteFetch } from "@/lib/integration-server";
import type { CalendarEvent } from "@/lib/calendar";

type GoogleEvent = { id?: string; status?: string; summary?: string; description?: string; htmlLink?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } };

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const calendarId = params.get("calendarId") || "primary";
    if (calendarId.length > 1024 || Array.from(calendarId).some((char) => char.charCodeAt(0) < 32)) throw new IntegrationError("Invalid calendar selection.");
    const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
    if (!validDate(from) || !validDate(to) || to <= from || Date.parse(to) - Date.parse(from) > 62 * 86400000) throw new IntegrationError("Choose a valid calendar range of up to 62 days.");
    const token = await accessToken();
    const events: CalendarEvent[] = [];
    let pageToken = "";
    let pages = 0;
    do {
      const query = new URLSearchParams({ timeMin: `${from}T00:00:00+07:00`, timeMax: `${to}T00:00:00+07:00`, timeZone: "Asia/Bangkok", singleEvents: "true", orderBy: "startTime", showDeleted: "false", maxResults: "250", fields: "nextPageToken,items(id,status,summary,description,htmlLink,start,end)" });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await remoteFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? "อ่านกิจกรรมไม่ได้ ไป Settings → อัปเดตสิทธิ์ Google และตรวจว่าเปิด Google Calendar API ในโปรเจกต์แล้ว" : response.status === 404 ? "ไม่พบปฏิทินนี้หรือบัญชี Google ไม่มีสิทธิ์อ่าน ลองเลือกปฏิทินอื่น" : "Could not load Google Calendar. Please refresh to try again.", response.status === 401 || response.status === 403 ? 401 : 502);
      const data = await response.json() as { items?: GoogleEvent[]; nextPageToken?: string };
      for (const item of data.items ?? []) {
        const start = item.start?.date ?? item.start?.dateTime;
        const end = item.end?.date ?? item.end?.dateTime;
        if (!item.id || item.status === "cancelled" || !start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) continue;
        let url: string | undefined;
        try { const link = new URL(item.htmlLink ?? ""); if (link.protocol === "https:" && ["www.google.com", "calendar.google.com"].includes(link.hostname)) url = link.toString(); } catch { /* Optional link. */ }
        events.push({ id: calendarId === "primary" ? item.id : `calendar:${encodeURIComponent(calendarId)}:${item.id}`, calendarId, title: item.summary || "Untitled event", description: item.description || "", start, end, allDay: Boolean(item.start?.date), url });
      }
      pageToken = data.nextPageToken ?? "";
      pages++;
    } while (pageToken && pages < 20);
    if (pageToken) throw new IntegrationError("This calendar range contains too many events. Please try a less busy month.", 422);
    return Response.json({ events, timeZone: "Asia/Bangkok" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const task = await readTask(request);
    const token = await accessToken();
    const response = await remoteFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(calendarEvent(task)),
    });
    if (response.status === 409) return Response.json({ message: "This task is already in Google Calendar." });
    if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? "Google Calendar access failed. Check API setup and reconnect in Settings." : "Google Calendar could not save this task. Please try again.", 502);
    return Response.json({ message: "Added to Google Calendar as an all-day event on the deadline." });
  } catch (error) { return failure(error); }
}
