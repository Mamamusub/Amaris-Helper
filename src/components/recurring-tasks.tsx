"use client";
import { useEffect } from "react";
import { dayKey } from "@/lib/calendar";
import { goLessons, migrateGoDescriptions } from "@/lib/recurring-tasks";
import type { Task } from "@/lib/types";

export default function RecurringTasks({ tasks, save, saveDescriptions }: { tasks: Task[]; save: (tasks: Task[]) => void; saveDescriptions: (tasks: Task[]) => boolean }) {
  useEffect(() => {
    const next = migrateGoDescriptions(tasks);
    if (next.some((task, index) => task !== tasks[index])) saveDescriptions(next);
  }, [tasks, saveDescriptions]);
  useEffect(() => {
    const extend = () => { const additions = goLessons(tasks, dayKey(new Date())); if (additions.length) save(additions); };
    extend();
    const timer = setInterval(extend, 60000);
    return () => clearInterval(timer);
  }, [tasks, save]);
  return null;
}

export function GoLessonButton({ tasks, save }: { tasks: Task[]; save: (tasks: Task[]) => void }) {
  const enabled = tasks.some((task) => task.recurrence === "go-kus-thursday");
  return <button type="button" className="secondary-button go-lesson-button" disabled={enabled} onClick={() => save(goLessons(tasks, dayKey(new Date()), true))}>{enabled ? "✓ ตั้งสอนโกะที่ kus ทุกวันพฤหัสบดีแล้ว" : "+ ตั้งสอนโกะที่ kus ทุกวันพฤหัสบดี"}</button>;
}
