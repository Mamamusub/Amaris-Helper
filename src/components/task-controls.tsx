"use client";

import { createContext, useContext, useState } from "react";
import type { Subject, Task } from "@/lib/types";

export const TaskContext = createContext<{
  subjects: Subject[];
  update: (id: string, patch: Partial<Task>) => void;
  remove: (id: string) => void;
  edit: (task: Task) => void;
  create: (subjectId?: string, deadline?: string, focused?: boolean) => void;
  openSubject: (id: string) => void;
}>({ subjects: [], update() {}, remove() {}, edit() {}, create() {}, openSubject() {} });

export function TaskControls({ task }: { task: Task }) {
  const actions = useContext(TaskContext);
  const subject = actions.subjects.find((item) => item.id === task.subjectId);
  return <div className="shared-task-actions">
    {subject && <button className="text-button" onClick={() => actions.openSubject(subject.id)}>{subject.name} ↗</button>}
    <button className="secondary-button" onClick={() => actions.edit(task)}>Edit</button>
    <button className="secondary-button" aria-pressed={!!task.focused} onClick={() => actions.update(task.id, { focused: !task.focused })}>{task.focused ? "★ Focused" : "☆ Focus"}</button>
    <button className="secondary-button" onClick={() => actions.update(task.id, { status: task.status === "Done" ? "Planned" : "Done" })}>{task.status === "Done" ? "Reopen" : "Complete"}</button>
    <button className="text-button" onClick={() => actions.remove(task.id)}>Delete</button>
  </div>;
}

export function TaskEditor({ task, onSave, onClose }: { task: Task; onSave: (task: Task) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(task);
  const { subjects } = useContext(TaskContext);
  return <div className="workspace-overlay" role="dialog" aria-modal="true" aria-label="Edit task" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}><form className="panel task-editor" onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onSave({ ...draft, title: draft.title.trim() }); }}>
    <div className="panel-heading"><h3>Task details</h3><button type="button" className="close-button" onClick={onClose} aria-label="Close task editor">×</button></div>
    <label>Title<input autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
    <label>Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <label>Due date<input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} /></label>
    <label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Task["priority"] })}>{["High", "Medium", "Low"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Task["status"] })}>{["Inbox", "Planned", "In Progress", "Waiting", "Done"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Subject<select value={draft.subjectId ?? ""} onChange={(event) => setDraft({ ...draft, subjectId: event.target.value || undefined, team: event.target.value ? "Study" : draft.team })}><option value="">No subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
    <label><input type="checkbox" checked={!!draft.focused} onChange={(event) => setDraft({ ...draft, focused: event.target.checked })} /> Focus today</label>
    <button className="primary-button" type="submit">Save task</button>
  </form></div>;
}
