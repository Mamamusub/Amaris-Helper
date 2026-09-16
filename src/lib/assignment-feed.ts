import type { CalendarEvent } from "./calendar";

export function mergeAssignmentEvents(calendar: CalendarEvent[], classroom: CalendarEvent[]) {
  const links = new Set(classroom.flatMap(event => event.url ? [event.url] : []));
  // Match source links, never titles: different courses can assign the same title.
  const filtered = calendar.filter(event => ![...links].some(link => event.url === link || Array.from(event.description.match(/https:\/\/classroom\.google\.com\/[^\s<>"']+/g) ?? []).includes(link)));
  return [...new Map([...filtered, ...classroom].map(event => [event.id, event])).values()];
}

export async function loadAssignmentFeed(params: URLSearchParams, signal: AbortSignal) {
  const results = await Promise.allSettled(["events", "classroom"].map(async route => {
    const response = await fetch(`/api/integrations/google/${route}?${params}`, { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Could not load ${route}`);
    return data.events as CalendarEvent[];
  }));
  const read = (index: number) => results[index].status === "fulfilled" ? results[index].value : [];
  return { events: mergeAssignmentEvents(read(0), read(1)), warning: [...new Set(results.flatMap(result => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "Google connection failed"] : []))].join(" · ") };
}
