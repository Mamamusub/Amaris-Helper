"use client";
import { useContext, useEffect, useState } from "react";
import { TaskContext, TaskControls } from "./task-controls";
import { dayKey, shiftDay, type CalendarEvent } from "@/lib/calendar";
import { loadAssignmentFeed } from "@/lib/assignment-feed";
import { focusCandidates } from "@/lib/task-model";
import type { Task } from "@/lib/types";

export default function FocusAssignments({ calendarId: selectedCalendarId, tasks, onCreateTask }: { calendarId: string; tasks: Task[]; onCreateTask: (task: Task) => void }) {
  const actions = useContext(TaskContext);
  const [resultEvents, setEvents] = useState<{ key: string; items: CalendarEvent[] }>({ key: "", items: [] });
  const [status, setStatus] = useState("Loading Calendar assignments…");
  const [revision, setRevision] = useState(0);
  const [today, setToday] = useState(() => dayKey(new Date()));
  const requestKey = `${selectedCalendarId || "primary"}:${today}:${revision}`;
  const events = resultEvents.key === requestKey ? resultEvents.items : [];
  useEffect(() => {
    const timer = setInterval(() => setToday(dayKey(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
    async function load() {
      try {
        const data = await loadAssignmentFeed(new URLSearchParams({ calendarId: selectedCalendarId || "primary", from: today, to: shiftDay(today, 62) }), signal);
        if (!controller.signal.aborted) { setEvents({ key: requestKey, items: data.events }); setStatus(data.warning); }
      } catch (error) {
        if (!controller.signal.aborted) { setEvents({ key: requestKey, items: [] }); setStatus(error instanceof Error ? error.message : "Calendar could not load."); }
      }
    }
    void load();
    return () => controller.abort();
  }, [today, revision, selectedCalendarId, requestKey]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const dated = focusCandidates(tasks, events.filter(event => !event.noDueDate), today);
  const undated = events.filter(event => event.noDueDate && !tasks.some(task => task.sourceEventId === event.id));
  const shown = dated;
  return <>
    {status && <p className="muted" role="status">{status} <button className="text-button" onClick={() => setRevision((value) => value + 1)}>Refresh</button></p>}
    {!shown.length && !undated.length && !status && <p className="empty-state">No unfinished assignments due in the next 62 days.</p>}
    {undated.map(event => <p key={event.id}>Classroom · {event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.title}</a> : event.title} · No due date</p>)}
    {shown.map((task, index) => <div key={task.id}>
      <div className="task-row" style={task.color ? { borderLeftColor: task.color } : undefined} data-go-lesson={task.recurrence === "go-kus-thursday" || undefined}><span className={`task-number n${index}`}>0{index + 1}</span><div className="task-info"><strong>{task.title}</strong><small>{task.deadline ? `Due ${task.deadline}` : "No due date"}</small></div><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></div>
      {tasks.some((item) => item.id === task.id) ? <TaskControls task={task} /> : <div className="shared-task-actions"><span className="muted">Google Calendar</span><button className="secondary-button" onClick={() => actions.edit(task)}>Edit / Add to Tasks</button><button className="secondary-button" onClick={() => onCreateTask({ ...task, status: "Done" })}>Complete</button></div>}
    </div>)}
  </>;
}
