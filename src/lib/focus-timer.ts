export type FocusSession = { id: string; taskId: string; startedAt: number; runningSince: number | null; elapsedMs: number; durationMs: number; mode?: "countdown" | "stopwatch"; note: string; endedAt?: number; intervals?: { start: number; end: number }[] };
export function elapsed(session: FocusSession, now: number) {
  return Math.min(session.mode === "stopwatch" ? Infinity : session.durationMs, session.elapsedMs + (session.runningSince === null ? 0 : Math.max(0, now - session.runningSince)));
}
export function pause(session: FocusSession, now: number): FocusSession {
  const total = elapsed(session, now);
  const intervals = [...(session.intervals ?? [])];
  if (session.runningSince !== null && total > session.elapsedMs) intervals.push({ start: session.runningSince, end: session.runningSince + total - session.elapsedMs });
  return { ...session, elapsedMs: total, runningSince: null, intervals };
}
export function finish(session: FocusSession, now: number): FocusSession {
  if (session.endedAt) return session;
  const endedAt = session.mode === "stopwatch" || session.runningSince === null ? now : Math.min(now, session.runningSince + session.durationMs - session.elapsedMs);
  return { ...pause(session, now), endedAt };
}
export function formatTime(ms: number) { const seconds = Math.ceil(ms / 1000); return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }

// The existing Calendar day is Bangkok (UTC+7), with no daylight-saving offset.
export function focusedToday(intervals: { start: number; end: number }[], day: string) {
  const start = Date.parse(`${day}T00:00:00+07:00`);
  return intervals.reduce((sum, span) => sum + Math.max(0, Math.min(span.end, start + 86400000) - Math.max(span.start, start)), 0);
}

export function timerComplete(session: FocusSession, now: number) { return session.mode !== "stopwatch" && elapsed(session, now) >= session.durationMs; }
export function timerDisplay(session: FocusSession, now: number) { return session.mode === "stopwatch" ? formatTime(Math.floor(elapsed(session, now) / 1000) * 1000) : formatTime(session.durationMs - elapsed(session, now)); }
