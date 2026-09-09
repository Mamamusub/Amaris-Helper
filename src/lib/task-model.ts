import type { Subject, Task } from "./types";
import { eventDeadline, eventTaskId, type CalendarEvent } from "./calendar";

export function focusCandidates(tasks: Task[], events: CalendarEvent[], today: string): Task[] {
  const existing = new Set(tasks.map((task) => task.sourceEventId).filter(Boolean));
  const previews = new Map<string, Task>();
  for (const event of events) {
    if (existing.has(event.id)) continue;
    const id = eventTaskId(event.id);
    if (tasks.some((task) => task.id === id)) continue;
    previews.set(id, { id, sourceEventId: event.id, title: event.title, description: event.description, deadline: eventDeadline(event), status: "Planned", priority: "Medium", team: "Study", assignedAgent: "researcher", createdAt: today, updatedAt: today });
  }
  return todayTasks([...tasks, ...previews.values()], today);
}

export const liveTasks = (tasks: Task[]) => tasks.filter((task) => !task.deletedAt);
export function todayTasks(tasks: Task[], today: string): Task[] {
  const pending = liveTasks(tasks).filter((task) => task.status !== "Done");
  const nearest = sortTasksByDeadline(pending.filter((task) => !!task.deadline && task.deadline >= today)).slice(0, 3);
  const selected = new Map(nearest.map((task) => [task.id, task]));
  for (const task of pending) if (task.focused) selected.set(task.id, task);
  return sortTasksByDeadline([...selected.values()]);
}
export function sortTasksByDeadline(tasks: Task[]): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const leftDone = left.task.status === "Done" ? 1 : 0;
      const rightDone = right.task.status === "Done" ? 1 : 0;
      if (leftDone !== rightDone) return leftDone - rightDone;
      const leftDeadline = left.task.deadline || "9999-12-31";
      const rightDeadline = right.task.deadline || "9999-12-31";
      return leftDeadline.localeCompare(rightDeadline) || left.index - right.index;
    })
    .map(({ task }) => task);
}
export function updateTask(tasks: Task[], id: string, patch: Partial<Task>): Task[] {
  return tasks.map((task) => task.id === id ? { ...task, ...patch, id: task.id, createdAt: task.createdAt, updatedAt: new Date().toISOString() } : task);
}
// Add only an unambiguous legacy relationship; keep IDs and all original fields.
export function migrateTasks(tasks: Task[], subjects: Subject[]): Task[] {
  return tasks.map((task) => !task.subjectId && subjects.some((subject) => subject.id === task.assignedAgent) ? { ...task, subjectId: task.assignedAgent } : task);
}
