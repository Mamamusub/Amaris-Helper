import { shiftDay } from "./calendar";
import type { Task } from "./types";

export function goLessons(tasks: Task[], today: string, enable = false): Task[] {
  if (!enable && !tasks.some((task) => task.recurrence === "go-kus-thursday")) return [];
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const first = shiftDay(today, (4 - weekday + 7) % 7);
  const known = new Set(tasks.map((task) => task.id));
  return Array.from({ length: 12 }, (_, index) => {
    const deadline = shiftDay(first, index * 7);
    const [year, month, day] = deadline.split("-").map(Number);
    return { id: `recurring:go-kus:${deadline}`, title: `📚 (${year}/${month}/${day}) สอนโกะ kus`, description: "สอนโกะ kus ทุกวันพฤหัสบดี", deadline, recurrence: "go-kus-thursday" as const, team: "Study" as const, assignedAgent: "researcher", status: "Planned" as const, priority: "Medium" as const, createdAt: today, updatedAt: today };
  }).filter((task) => !known.has(task.id));
}
