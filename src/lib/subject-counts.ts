import type { Task } from "./types";

export function subjectMonth(tasks: Task[], subjectId: string, month: string) {
  const days: { date: string; tasks: Task[] }[] = [];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { days, offset: 0, count: 0 };
  const first = new Date(`${month}-01T12:00:00Z`);
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  const seen = new Set<string>();
  const completed = tasks.filter((task) => {
    if (task.subjectId !== subjectId || task.status !== "Done" || task.deletedAt || seen.has(task.id)) return false;
    seen.add(task.id); return true;
  });
  for (let day = 1; day <= last.getUTCDate(); day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    days.push({ date, tasks: completed.filter((task) => task.deadline === date) });
  }
  return { days, offset: (first.getUTCDay() + 6) % 7, count: days.reduce((sum, day) => sum + day.tasks.length, 0) };
}

export function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}
