"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { agents, getAgent } from "@/lib/agents";
import { CalendarEvent, calendarTimeZone, dayKey, calendarEntries, eventDeadline, eventTaskId, monthDays, shiftDay, shiftMonth } from "@/lib/calendar";
import type { Subject, Task } from "@/lib/types";

import { TaskContext, TaskControls } from "@/components/task-controls";

type LoadResult = { key: string; events: CalendarEvent[]; error?: string; connect?: boolean };
type GoogleCalendar = { id: string; name: string; primary: boolean; selected: boolean };
const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const dateLabel = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));

export default function DeadlineCalendar({ tasks, subjects, onCreateTask, onAssignAll, onSettings }: { tasks: Task[]; subjects: Subject[]; onCreateTask: (task: Task) => void; onAssignAll: (events: CalendarEvent[]) => void; onSettings: () => void }) {
  const actions = useContext(TaskContext);
  const today = dayKey(new Date());
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [filter, setFilter] = useState<"all" | "google" | "task">("all");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<LoadResult>({ key: "", events: [] });
  const [calendarId, setCalendarId] = useState("primary");
  const [calendarList, setCalendarList] = useState<{ items: GoogleCalendar[]; error?: string } | null>(null);
  const selectionInitialized = useRef(false);
  const selectedCalendar = calendarList?.items.find((calendar) => calendar.primary ? calendarId === "primary" : calendar.id === calendarId);
  const calendarName = selectedCalendar?.name ?? (calendarId === "primary" ? "Primary calendar" : "Selected calendar");
  const days = monthDays(month);
  const from = days[0];
  const to = shiftDay(days[41], 1);
  const requestKey = `${calendarId}:${month}:${revision}`;
  const loading = result.key !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/integrations/google/calendars", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) })
      .then(async (response) => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) { setCalendarList({ items: [], error: data.error || "โหลดรายชื่อปฏิทินไม่สำเร็จ" }); return; }
        const items = data.calendars as GoogleCalendar[];
        setCalendarList({ items });
        if (!selectionInitialized.current) {
          const classroom = items.find((calendar) => /classroom\s*assignments/i.test(calendar.name));
          if (classroom && !classroom.primary) setCalendarId(classroom.id);
          selectionInitialized.current = true;
        }
      }).catch(() => { if (!controller.signal.aborted) setCalendarList({ items: [], error: "โหลดรายชื่อปฏิทินไม่สำเร็จ กด Refresh เพื่อลองอีกครั้ง" }); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/integrations/google/events?${new URLSearchParams({ from, to, calendarId })}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) })
      .then(async (response) => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        setResult(response.ok ? { key: requestKey, events: data.events } : { key: requestKey, events: [], error: data.error || "Could not load calendar.", connect: response.status === 401 || response.status === 503 });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ key: requestKey, events: [], error: "Could not reach Google Calendar. Your local tasks are still shown." }); });
    return () => controller.abort();
  }, [from, to, requestKey, calendarId]);

  const events = loading ? [] : result.events;
  const unassignedEvents = events.filter((event) => !tasks.some((task) => task.sourceEventId === event.id));
  const entries = calendarEntries(tasks, events);
  const visible = entries.filter((entry) => filter === "all" || entry.source === filter || (filter === "task" && entry.task && entry.event && eventDeadline(entry.event) === entry.task.deadline));
  const onDay = (day: string) => visible.filter((entry) => entry.first <= day && entry.last >= day);
  const selected = onDay(selectedDay);
  const monthly = entries.filter((entry) => entry.first <= shiftDay(shiftMonth(month, 1) + "-01", -1) && entry.last >= `${month}-01`);
  const upcoming = entries.filter((entry) => !entry.done && entry.last >= today && entry.first <= shiftDay(today, 7));
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));

  function changeMonth(amount: number) {
    const next = shiftMonth(month, amount);
    setMonth(next); setSelectedDay(`${next}-01`);
  }

  return <div className="content deadline-page">
    <section className="deadline-hero">
      <div><span className="section-kicker">PAI&apos;S DEADLINE CALENDAR</span><h2>A little clarity.<br /><em>Ahead of every deadline.</em></h2><p>Google Calendar and your tasks, in one peaceful place.</p></div>
      <div className="calendar-mascot"><span aria-hidden="true">🐼</span><div><strong>A plan you can see.</strong><small>One day, one small step.</small></div><i aria-hidden="true">✦</i></div>
    </section>
    <div className="calendar-summary">
      <div><span className="calendar-stat-icon" aria-hidden="true">▦</span><div><strong>{monthly.length}</strong><small>items this month</small></div></div>
      <div><span className="calendar-stat-icon peach" aria-hidden="true">↗</span><div><strong>{month === today.slice(0, 7) ? upcoming.length : "—"}</strong><small>coming in 7 days</small></div></div>
      <div><span className="calendar-stat-icon lilac" aria-hidden="true">✓</span><div><strong>{monthly.filter((entry) => entry.done).length}</strong><small>completed tasks</small></div></div>
      <div className="calendar-source"><span className="status-dot" /><div><strong>{loading ? "Loading Google Calendar…" : result.error ? "Local tasks available" : "Google Calendar loaded"}</strong><small>{calendarName} · Bangkok time</small></div></div>
    </div>
    <div className="calendar-picker"><label htmlFor="google-calendar-source">Google calendar<select id="google-calendar-source" value={calendarId} onChange={(event) => setCalendarId(event.target.value)}><option value="primary">{calendarList?.items.find((calendar) => calendar.primary)?.name ?? "Primary calendar"} (Primary)</option>{calendarList?.items.filter((calendar) => !calendar.primary).map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label><div><small>{calendarList?.items.find((calendar) => calendar.primary)?.id ?? "เลือกปฏิทินเดียวกับที่เก็บกิจกรรมใน Google"}</small><p>{loading ? "กำลังโหลดกิจกรรม…" : result.error ? "ยังโหลดกิจกรรมจากปฏิทินนี้ไม่สำเร็จ" : `${events.length} กิจกรรมจาก Google ในช่วง ${from} ถึง ${shiftDay(to, -1)}`}</p></div></div>
    {calendarList?.error && <div className="calendar-connection" role="status"><div><strong>เลือกปฏิทินอื่น เช่น Classroom Assignments</strong><p>{calendarList.error}</p></div><button className="secondary-button" onClick={onSettings}>ไป Settings</button></div>}
    {!loading && result.error && <div className="calendar-connection" role="status"><div><strong>{result.connect ? "Bring your Google Calendar here" : "Calendar could not refresh"}</strong><p>{result.error}</p></div><button className="secondary-button" onClick={result.connect ? onSettings : () => setRevision((value) => value + 1)}>{result.connect ? "Connect in Settings ↗" : "Try again"}</button></div>}
    <div className="calendar-layout">
      <section className="calendar-board" aria-label="Deadline calendar">
        <div className="calendar-toolbar"><div><span className="eyebrow">MAKE ROOM FOR WHAT MATTERS</span><h3 aria-live="polite">{monthLabel}</h3></div><div className="calendar-controls"><button onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(today); }}>Today</button><button onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button><button onClick={() => changeMonth(1)} aria-label="Next month">›</button></div><button className="primary-button" disabled={loading || !unassignedEvents.length} onClick={() => onAssignAll(unassignedEvents)}>{unassignedEvents.length ? `Assign all as tasks (${unassignedEvents.length})` : "All events assigned"}</button></div>
        <div className="calendar-filterbar"><div className="calendar-filters" aria-label="Calendar sources">{([['all', 'Everything'], ['google', 'Google Calendar'], ['task', 'My tasks']] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div><button className="calendar-refresh" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? "Loading…" : "↻ Refresh"}</button></div>
        <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{days.map((day) => {
          const items = onDay(day);
          return <button key={day} className={`calendar-day ${day.slice(0, 7) !== month ? "outside" : ""} ${day === selectedDay ? "selected" : ""} ${day === today ? "today" : ""}`} aria-pressed={day === selectedDay} aria-label={`${dateLabel(day)}, ${items.length} items${day === today ? ", today" : ""}`} onClick={() => setSelectedDay(day)}>
            <span className="calendar-day-number">{Number(day.slice(8))}</span><span className="calendar-day-events">{items.slice(0, 2).map((entry) => <span key={entry.id} className={`calendar-event-chip ${entry.source} ${entry.done ? "done" : ""}`}><i />{entry.title}</span>)}{items.length > 2 && <span className="calendar-more">+{items.length - 2} more</span>}</span>
            <span className="calendar-mobile-dots" aria-hidden="true">{items.slice(0, 3).map((entry) => <i key={entry.id} className={entry.source} />)}</span>
          </button>;
        })}</div>
        <div className="calendar-legend"><span><i className="google" /> Google events</span><span><i className="task" /> Task deadlines</span><small>Asia/Bangkok · UTC+7</small></div>
      </section>
      <aside className="calendar-agenda"><div className="agenda-heading"><span className="eyebrow">YOUR DAY, AT A GLANCE</span><h3>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${selectedDay}T12:00:00Z`))}<span>{selected.length} items</span></h3><p>{dateLabel(selectedDay)}</p></div>
        {selected.length === 0 ? <div className="agenda-empty"><span aria-hidden="true">✧</span><h4>A little breathing room.</h4><p>{loading ? "Loading Google events. Your local deadlines are already here." : "No items on this day. Pick another date to see what’s coming."}</p></div> : <div className="agenda-items">{selected.map((entry) => <article key={entry.id} className={`agenda-item ${entry.source}`}><span className="agenda-tag">{entry.source === "google" ? "GOOGLE CALENDAR" : entry.task?.team.toUpperCase()}{entry.done ? " · DONE" : ""}</span><h4>{entry.title}</h4><p className="agenda-time">{entry.event ? entry.event.allDay ? "All day" : new Intl.DateTimeFormat("en-US", { timeZone: calendarTimeZone, hour: "numeric", minute: "2-digit" }).format(new Date(entry.event.start)) : "Deadline"}{entry.first !== entry.last ? ` · ${entry.first} → ${entry.last}` : ""}</p>
          {(entry.event?.description || entry.task?.description) && <p className="agenda-description">{entry.event?.description || entry.task?.description}</p>}
          {entry.task && <TaskControls task={entry.task} />}{entry.task && <div className="agenda-assigned"><span>{getAgent(entry.task.assignedAgent)?.avatar ?? "🐼"}</span><small>{getAgent(entry.task.assignedAgent)?.name ?? "Panda"} · {entry.task.status}<br />Task due {entry.task.deadline}</small></div>}
          {entry.event && !entry.task && <AssignEvent event={entry.event} subjects={subjects} onCreateTask={onCreateTask} />}
          {entry.event?.url && <a className="calendar-google-link" href={entry.event.url} target="_blank" rel="noreferrer">Open in Google Calendar ↗</a>}
        </article>)}</div>}
        <button className="primary-button" onClick={() => actions.create(undefined, selectedDay)}>+ New task</button><div className="agenda-note"><span aria-hidden="true">✦</span><p>Pick a Google event and assign it to your team. Its deadline becomes a task you can track.</p></div>
      </aside>
    </div>
  </div>;
}

function AssignEvent({ event, subjects, onCreateTask }: { event: CalendarEvent; subjects: Subject[]; onCreateTask: (task: Task) => void }) {
  const [deadline, setDeadline] = useState(() => eventDeadline(event));
  const [agentId, setAgentId] = useState("secretary");
  const [subjectId, setSubjectId] = useState("");
  return <form className="calendar-assign" onSubmit={(submit) => {
    submit.preventDefault();
    const agent = getAgent(agentId)!;
    const now = new Date().toISOString();
    onCreateTask({ id: eventTaskId(event.id), sourceEventId: event.id, title: event.title, description: event.description, deadline, team: agent.team, assignedAgent: agentId, status: "Planned", priority: "Medium", createdAt: now, updatedAt: now, ...(subjectId ? { subjectId } : {}) });
  }}>
    <label>Due date<input type="date" required value={deadline} onChange={(change) => setDeadline(change.target.value)} /></label>
    <label>Assign to<select value={agentId} onChange={(change) => setAgentId(change.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.avatar} {agent.name}</option>)}</select></label>
    <label>Subject<select value={subjectId} onChange={(change) => setSubjectId(change.target.value)}><option value="">No subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
    <button className="primary-button" type="submit">+ Assign as task</button>
  </form>;
}
