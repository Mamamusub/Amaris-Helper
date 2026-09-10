import { shiftDay } from "./calendar";
import type { Task } from "./types";

export function migrateGoDescriptions(tasks: Task[]): Task[] {
  return tasks.map((task) => {
    const isGoKus = task.recurrence === "go-kus-thursday" || /สอนโกะ.*\bkus\b/i.test(task.title);
    if (!isGoKus || task.goKusDescriptionVersion === 1) return task;
    return { ...task, description: "ที่ kus", goKusDescriptionVersion: 1 as const, ...(task.nextTemplate ? { nextTemplate: { ...task.nextTemplate, description: "ที่ kus" } } : {}) };
  });
}

export function goLessons(tasks: Task[], today: string, enable = false): Task[] {
  if (!enable && !tasks.some((task) => task.recurrence === "go-kus-thursday")) return [];
  const monthStart = `${today.slice(0, 7)}-01`;
  const weekday = new Date(`${monthStart}T12:00:00Z`).getUTCDay();
  const first = shiftDay(monthStart, (4 - weekday + 7) % 7);
  const known = new Set(tasks.map((task) => task.id));
  return Array.from({ length: 12 }, (_, index) => {
    const deadline = shiftDay(first, index * 7);
    const [year, month, day] = deadline.split("-").map(Number);
    return { id: `recurring:go-kus:${deadline}`, title: `📚 (${year}/${month}/${day}) สอนโกะ kus`, description: "ที่ kus", goKusDescriptionVersion: 1 as const, deadline, recurrence: "go-kus-thursday" as const, team: "Study" as const, assignedAgent: "researcher", status: "Planned" as const, priority: "Medium" as const, createdAt: today, updatedAt: today };
  }).filter((task) => !known.has(task.id));
}
