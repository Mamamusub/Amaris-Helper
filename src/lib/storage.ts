import { AgentRun, ChatMessage, Subject, Task } from "./types";

export const storageKeys = { tasks: "agent-helper.tasks", subjects: "agent-helper.subjects", messages: "agent-helper.messages", runs: "agent-helper.runs" } as const;

export const demoTasks: Task[] = [
  { id: "task-1", title: "Review calculus integration notes", description: "Finish the worked examples and mark unclear steps.", team: "Study", assignedAgent: "researcher", status: "In Progress", priority: "High", deadline: "2026-09-10", createdAt: "2026-09-07", updatedAt: "2026-09-08" },
  { id: "task-2", title: "Rewrite two CV project bullets", description: "Make the outcome and technical contribution concrete.", team: "Career", assignedAgent: "cv-reviewer", status: "Planned", priority: "Medium", deadline: "2026-09-11", createdAt: "2026-09-08", updatedAt: "2026-09-08" },
  { id: "task-3", title: "Define portfolio app MVP", description: "Choose the smallest useful first release.", team: "Development", assignedAgent: "product-planner", status: "Inbox", priority: "Medium", deadline: "2026-09-12", createdAt: "2026-09-08", updatedAt: "2026-09-08" },
  { id: "task-4", title: "Submit internship application", description: "Final pass on application materials.", team: "Career", assignedAgent: "career-coach", status: "Done", priority: "High", deadline: "2026-09-06", createdAt: "2026-09-02", updatedAt: "2026-09-06" },
];

export const demoSubjects: Subject[] = [
  { id: "subject-demo", name: "Calculus · demo", color: "#a9d85b", nextEvent: "Exam · Sep 18", context: "Demo subject. Add your own subjects from the Study view." },
];

export const demoMessages: Record<string, ChatMessage[]> = {
  secretary: [{ id: "welcome-secretary", role: "agent", content: "Good morning. I have your priorities in view. Tell me what you are trying to move forward and I will route it to the right person.", createdAt: "2026-09-08" }],
};

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

export function writeStorage<T>(key: string, value: T) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

export type StoredMessages = Record<string, ChatMessage[]>;
export type StoredRuns = AgentRun[];
