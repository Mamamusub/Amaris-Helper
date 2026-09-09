"use client";
import { useContext, useEffect, useState } from "react";
import { TaskContext, TaskControls } from "./task-controls";
import { dayKey, shiftDay, type CalendarEvent } from "@/lib/calendar";
import { focusCandidates } from "@/lib/task-model";
import type { Task } from "@/lib/types";

export default function FocusAssignments({ calendarId: selectedCalendarId, tasks, onCreateTask }: { calendarId: string; tasks: Task[]; onCreateTask: (task: Task) => void }) {
  const actions = useContext(TaskContext);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState("Loading Calendar assignments…");
  const [revision, setRevision] = useState(0);
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setToday(dayKey(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
    async function load() {
      try {
        const response = await fetch("/api/integrations/google/calendars", { cache: "no-store", signal });
        const body = await response.json();
        if (!response.ok) throw new Error("Connect Calendar in Settings to include its assignments.");
        const calendars = body.calendars as { id: string; name: string; primary: boolean }[];
        const classroom = calendars.find((calendar) => /classroom\s*assignments/i.test(calendar.name));
        const calendarId = selectedCalendarId || (classroom && !classroom.primary ? classroom.id : "primary");
        const result = await fetch(`/api/integrations/google/events?${new URLSearchParams({ calendarId, from: today, to: shiftDay(today, 62) })}`, { cache: "no-store", signal });
        const data = await result.json();
        if (!result.ok) throw new Error("Calendar could not load. Your saved tasks are still shown.");
        if (!controller.signal.aborted) { setEvents(data.events); setStatus(""); }
      } catch (error) {
        if (!controller.signal.aborted) { setEvents([]); setStatus(error instanceof Error ? error.message : "Calendar could not load."); }
      }
    }
    void load();
    return () => controller.abort();
  }, [today, revision, selectedCalendarId]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const shown = focusCandidates(tasks, events, today);
  return <>
    {status && <p className="muted" role="status">{status} <button className="text-button" onClick={() => setRevision((value) => value + 1)}>Refresh</button></p>}
    {!shown.length && !status && <p className="empty-state">No unfinished assignments due in the next 62 days.</p>}
    {shown.map((task, index) => <div key={task.id}>
      <div className="task-row"><span className={`task-number n${index}`}>0{index + 1}</span><div className="task-info"><strong>{task.title}</strong><small>{task.deadline ? `Due ${task.deadline}` : "No due date"}</small></div><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></div>
      {tasks.some((item) => item.id === task.id) ? <TaskControls task={task} /> : <div className="shared-task-actions"><span className="muted">Google Calendar</span><button className="secondary-button" onClick={() => actions.edit(task)}>Edit / Add to Tasks</button><button className="secondary-button" onClick={() => onCreateTask({ ...task, status: "Done" })}>Complete</button></div>}
    </div>)}
  </>;
}
