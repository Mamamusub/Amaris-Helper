import type { Task } from "./types";

export function countedTaskTitle(task: Task): string {
  if (task.recurrence === "go-kus-thursday") return "สอนโกะ kus";
  return task.title.replace(/\(\d{4}[/-]\d{1,2}[/-]\d{1,2}\)/g, " ")
    .replace(/^[\s\p{Extended_Pictographic}\uFE0F]+/u, "").replace(/\s+/g, " ").trim();
}

export function monthlyTaskCounts(tasks: Task[], month: string) {
  const groups = new Map<string, { title: string; total: number; completed: number; pending: number }>();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const seen = new Set<string>();
  for (const task of tasks) {
    if (task.deletedAt || seen.has(task.id) || !task.deadline?.startsWith(`${month}-`)) continue;
    seen.add(task.id);
    const title = countedTaskTitle(task), key = title.toLocaleLowerCase();
    const group = groups.get(key) ?? { title, total: 0, completed: 0, pending: 0 };
    group.total++;
    if (task.status === "Done") group.completed++;
    else group.pending++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, "th"));
}
