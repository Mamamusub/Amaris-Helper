import type { Task, Subject, AgentRun } from "./types";
import { demoTasks, demoSubjects, storageKeys, type StoredMessages } from "./storage";
export type Kind = "task" | "subject" | "thread" | "run" | "document";
export type RecordData = { id: string; [key: string]: unknown };
export type CloudRecord = { kind: Kind; id: string; data: RecordData; version: number };
export type Change = CloudRecord;
export type Operation = { operationId: string; changes: Change[]; importing?: boolean };
export type WorkspaceData = { tasks: Task[]; subjects: Subject[]; messages: StoredMessages; runs: AgentRun[] };
export function materialize(records: CloudRecord[]): WorkspaceData {
  const ofKind = (kind: Kind) => records.filter((row) => row.kind === kind).map((row) => row.data);
  return { tasks: ofKind("task") as Task[], subjects: ofKind("subject").filter((row) => !row.deletedAt) as Subject[], runs: ofKind("run").filter((row) => !row.deletedAt) as AgentRun[], messages: ofKind("thread").filter((row) => !row.deletedAt).reduce<StoredMessages>((threads, row) => { const { threadId, ...message } = row; if (typeof threadId === "string") (threads[threadId] ??= []).push(message as unknown as StoredMessages[string][number]); return threads; }, {}) };
}
export function collection(kind: Kind, value: Task[] | Subject[] | AgentRun[] | StoredMessages | RecordData[]): RecordData[] {
  return kind === "thread" ? Object.entries(value as StoredMessages).flatMap(([threadId, messages]) => messages.map((message) => ({ ...message, threadId }))) : value as RecordData[];
}
export function localImport(storage: Pick<Storage, "getItem">): CloudRecord[] {
  const read = (key: string, fallback: unknown) => { const raw = storage.getItem(key); return raw ? JSON.parse(raw) : fallback; };
  const tasks = (read(storageKeys.tasks, []) as Task[]).filter((task) => !demoTasks.some((demo) => JSON.stringify(demo) === JSON.stringify(task)));
  const subjects = (read(storageKeys.subjects, []) as Subject[]).filter((subject) => tasks.some((task) => task.subjectId === subject.id || task.assignedAgent === subject.id) || !demoSubjects.some((demo) => JSON.stringify(demo) === JSON.stringify(subject)));
  const messages = Object.fromEntries(Object.entries(read(storageKeys.messages, {}) as StoredMessages).map(([id, list]) => [id, list.filter((message) => message.id !== "welcome-secretary")]).filter(([, list]) => (list as unknown[]).length));
  const result: CloudRecord[] = [];
  for (const [kind, value] of [["subject", subjects], ["task", tasks.map((task) => !task.subjectId && subjects.some((subject) => subject.id === task.assignedAgent) ? { ...task, subjectId: task.assignedAgent } : task)], ["thread", messages], ["run", read(storageKeys.runs, [])]] as const) {
    for (const data of collection(kind, value as Task[])) result.push({ kind, id: data.id, data, version: 0 });
  }
  return result;
}
export function overlay(records: CloudRecord[], operations: Operation[]): CloudRecord[] {
  const map = new Map(records.map((record) => [`${record.kind}:${record.id}`, record]));
  for (const operation of operations) for (const change of operation.changes) {
    const key = `${change.kind}:${change.id}`;
    if (operation.importing && map.has(key)) continue;
    map.set(key, { ...change, version: change.version + 1 });
  }
  return [...map.values()];
}
