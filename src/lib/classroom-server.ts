import { accessToken, googleClassroomScopes, googleDataScopes, IntegrationError, remoteFetch } from "./integration-server";
import { dayKey, shiftDay, type CalendarEvent } from "./calendar";

type Course = { id: string; name: string };
type Work = { id: string; title: string; description?: string; alternateLink?: string; state?: string; dueDate?: { year: number; month: number; day: number }; dueTime?: { hours?: number; minutes?: number; seconds?: number; nanos?: number } };
export function assignmentEvent(course: Course, work: Work): CalendarEvent {
  const d = work.dueDate;
  const t = work.dueTime;
  const date = d ? `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : "";
  // Classroom date and time are UTC, including an empty dueTime object (midnight).
  const start = d && t ? new Date(`${date}T${String(t.hours ?? 0).padStart(2, "0")}:${String(t.minutes ?? 0).padStart(2, "0")}:${String(t.seconds ?? 0).padStart(2, "0")}.${String(Math.floor((t.nanos ?? 0) / 1e6)).padStart(3, "0")}Z`).toISOString() : date;
  let url: string | undefined;
  try { const link = new URL(work.alternateLink ?? ""); if (link.protocol === "https:" && link.hostname === "classroom.google.com") url = link.href; } catch { /* Optional URL. */ }
  return { id: `classroom:${course.id}:${work.id}`, title: `${course.name} — ${work.title}`, description: work.description ?? "", start, end: d ? t ? start : shiftDay(date, 1) : "", allDay: !t, url, source: "classroom", noDueDate: !d };
}

export async function classroomAssignments(from: string, to: string) {
  const scopes = await googleDataScopes();
  if (!googleClassroomScopes.every(scope => scopes.includes(scope))) throw new IntegrationError("บัญชี Google นี้ไม่มีสิทธิ์อ่านงาน Classroom บัญชีมหาวิทยาลัยอาจบล็อกสิทธิ์นี้ ติดต่อผู้ดูแลระบบหรืออัปเดตสิทธิ์ใน Settings", 403);
  const token = await accessToken();
  let requests = 0;
  async function list<T>(path: string, key: string, params: Record<string, string>): Promise<T[]> {
    const items: T[] = [];
    const seen = new Set<string>();
    let pageToken = "";
    do {
      if (++requests > 100) throw new IntegrationError("Classroom มีข้อมูลมากเกินไป ยังโหลดไม่ครบ กรุณาลองใหม่", 422);
      const query = new URLSearchParams({ ...params, pageSize: "100", ...(pageToken ? { pageToken } : {}) });
      const response = await remoteFetch(`https://classroom.googleapis.com/v1/${path}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? "อ่าน Classroom ไม่ได้: เปิด Google Classroom API แล้วไป Settings → อัปเดตสิทธิ์ Google ด้วยบัญชีนักเรียน หากโรงเรียนบล็อกให้ติดต่อผู้ดูแล" : "Classroom โหลดไม่สำเร็จ กรุณา Refresh อีกครั้ง", response.status === 401 || response.status === 403 ? 401 : 502);
      const data = await response.json();
      items.push(...(data[key] ?? []));
      pageToken = data.nextPageToken ?? "";
      if (pageToken && seen.has(pageToken)) throw new IntegrationError("Classroom ส่งหน้าข้อมูลซ้ำ กรุณาลองใหม่", 502);
      seen.add(pageToken);
    } while (pageToken);
    return items;
  }
  const courses = await list<Course>("courses", "courses", { studentId: "me", courseStates: "ACTIVE" });
  const events = new Map<string, CalendarEvent>();
  // Limit concurrent course requests while following every page.
  for (let i = 0; i < courses.length; i += 4) {
    const batches = await Promise.all(courses.slice(i, i + 4).map(async course => {
      const works = await list<Work>(`courses/${encodeURIComponent(course.id)}/courseWork`, "courseWork", { courseWorkStates: "PUBLISHED" });
      return works.filter(work => work.state !== "DELETED" && work.state !== "DRAFT").map(work => assignmentEvent(course, work));
    }));
    for (const event of batches.flat()) {
      const day = event.noDueDate ? "" : event.allDay ? event.start : dayKey(new Date(event.start));
      if (!day || day >= from && day < to) events.set(event.id, event);
    }
  }
  return [...events.values()];
}
