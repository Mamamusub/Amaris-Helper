export const calendarTimeZone = "Asia/Bangkok";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  url?: string;
  calendarId?: string;
};

export function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: calendarTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function monthDays(month: string) {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = shiftDay(first, -((weekday + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => shiftDay(start, index));
}

export function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

export function eventDays(event: CalendarEvent) {
  if (event.allDay) return { first: event.start, last: shiftDay(event.end, -1) };
  return { first: dayKey(new Date(event.start)), last: dayKey(new Date(Math.max(Date.parse(event.start), Date.parse(event.end) - 1))) };
}

export function eventDeadline(event: CalendarEvent) {
  const days = eventDays(event);
  return event.allDay ? days.last : days.first;
}

export function eventTaskId(eventId: string) {
  return `google-primary:${eventId}`;
}

export function eventSubjectName(event: CalendarEvent) {
  const separator = event.title.split(/\s+(?:-|:|\||–|—)\s+/)[0]?.trim();
  if (separator && separator.length >= 3 && separator.length <= 80) return separator;
  return event.title.trim().split(/\s+/).slice(0, 4).join(" ") || "Uncategorized";
}

export function eventSubjectId(name: string) {
  return `google-subject:${encodeURIComponent(name.trim().toLowerCase())}`;
}
