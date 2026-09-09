import type { Subject, Task } from "./types";

export const liveTasks = (tasks: Task[]) => tasks.filter((task) => !task.deletedAt);
export const todayTasks = (tasks: Task[], today: string) => liveTasks(tasks).filter((task) => task.status !== "Done" && (task.focused || (!!task.deadline && task.deadline <= today)));
export function updateTask(tasks: Task[], id: string, patch: Partial<Task>): Task[] {
  return tasks.map((task) => task.id === id ? { ...task, ...patch, id: task.id, createdAt: task.createdAt, updatedAt: new Date().toISOString() } : task);
}
// Add only an unambiguous legacy relationship; keep IDs and all original fields.
export function migrateTasks(tasks: Task[], subjects: Subject[]): Task[] {
  return tasks.map((task) => !task.subjectId && subjects.some((subject) => subject.id === task.assignedAgent) ? { ...task, subjectId: task.assignedAgent } : task);
}
