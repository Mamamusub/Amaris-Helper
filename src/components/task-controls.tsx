"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Subtasks, RepeatEditor } from "./task-extras";
import { repeatSummary } from "@/lib/task-recurrence";
import { dialogKeyboard } from "./dialog-keyboard";
import type { Subject, Task } from "@/lib/types";

export const TaskContext = createContext<{
  focus: (id: string) => void;
  subjects: Subject[];
  addSubject: (subject: Subject) => boolean;
  deleteSubject: (id: string) => boolean;
  update: (id: string, patch: Partial<Task>) => void;
  remove: (id: string) => void;
  edit: (task: Task) => void;
  create: (subjectId?: string, deadline?: string, focused?: boolean) => void;
  openSubject: (id: string) => void;
}>({ focus() {}, subjects: [], addSubject: () => false, deleteSubject: () => false, update() {}, remove() {}, edit() {}, create() {}, openSubject() {} });

export function TaskControls({ task }: { task: Task }) {
  const actions = useContext(TaskContext);
  const subject = actions.subjects.find((item) => item.id === task.subjectId);
  return <div className="shared-task-actions">
    {!!task.subtasks?.length && <span className="task-progress" aria-label="ความคืบหน้างานย่อย">{task.subtasks.filter((item) => item.done).length}/{task.subtasks.length}<progress max={task.subtasks.length} value={task.subtasks.filter((item) => item.done).length} /></span>}
    {task.repeat && <small className="repeat-label">↻ {repeatSummary(task.repeat)}</small>}
    <button className="secondary-button" onClick={() => actions.focus(task.id)}>เริ่มโฟกัส</button>
    {subject && <button className="text-button" onClick={() => actions.openSubject(subject.id)}>{subject.name} ↗</button>}
    <button className="secondary-button" onClick={() => actions.edit(task)}>Edit</button>
    <button className="secondary-button" aria-pressed={!!task.focused} onClick={() => actions.update(task.id, { focused: !task.focused })}>{task.focused ? "★ Focused" : "☆ Focus"}</button>
    <button className="secondary-button" onClick={() => actions.update(task.id, { status: task.status === "Done" ? "Planned" : "Done" })}>{task.status === "Done" ? "Reopen" : "Complete"}</button>
    <button className="text-button" onClick={() => actions.remove(task.id)}>Delete</button>
  </div>;
}

export function canonicalTaskTitle(title: string) {
  return title.trim()
    .replace(/\s*\(\d{4}\/\d{1,2}\/\d{1,2}\)\s*/g, " ")
    .replace(/สอนโกะ\s+kus/gi, "สอนโกะ")
    .split(/\s+-\s+/)[0]
    .trim();
}

export function TaskEditor({ task, tasks = [], onSave, onClose, recurringAction }: { task: Task; tasks?: Task[]; onSave: (task: Task, scope?: "this" | "future") => void; onClose: () => void; recurringAction?: ReactNode }) {
  const [draft, setDraft] = useState(task);
  const [scope, setScope] = useState<"this" | "future">("future");
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const { subjects, addSubject } = useContext(TaskContext);
  const titleOptions = Array.from(new Set(tasks.map((item) => canonicalTaskTitle(item.title)).filter(Boolean)));
  return <div className="workspace-overlay" role="dialog" aria-modal="true" aria-label="Edit task" onKeyDown={(event) => dialogKeyboard(event, onClose)}><form className="panel task-editor" onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onSave({ ...draft, title: draft.title.trim(), ...(draft.repeat && scope === "future" && draft.deadline !== task.deadline ? { repeat: { ...draft.repeat, anchor: draft.deadline }, occurrenceDate: draft.deadline } : {}), subtasks: (draft.subtasks ?? []).filter((item) => item.title.trim()) }, scope); }}>
    <div className="panel-heading"><h3>Task details</h3><button type="button" className="close-button" onClick={onClose} aria-label="Close task editor">×</button></div>
    {recurringAction && <div className="task-editor-recurring">{recurringAction}</div>}
    <label>Title<input autoFocus required list="task-title-options" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><datalist id="task-title-options">{titleOptions.map((title) => <option key={title} value={title} />)}</datalist></label>
    <label>Task color<input className="task-color-input" type="color" value={draft.color ?? "#d7f36b"} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label>
    <label>Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <Subtasks items={draft.subtasks} onChange={(subtasks) => setDraft({ ...draft, subtasks })} />
    {!!draft.subtasks?.length && draft.subtasks.every((item) => item.done) && draft.status !== "Done" && <button type="button" className="secondary-button" onClick={() => setDraft({ ...draft, status: "Done" })}>งานย่อยครบแล้ว · ปิดงานหลักเมื่อบันทึก</button>}
    {task.repeat && scope === "this" && <p className="muted">ตั้งค่าการทำซ้ำได้เมื่อเลือก “รอบนี้และรอบถัดไป”</p>}
    <RepeatEditor disabled={!!task.repeat && scope === "this"} task={draft} change={(patch) => setDraft({ ...draft, ...patch })} />
    {task.repeat && <label>ใช้การแก้ไขกับ<select value={scope} onChange={(event) => setScope(event.target.value as "this" | "future")}><option value="this">เฉพาะรอบนี้</option><option value="future">รอบนี้และรอบถัดไป</option></select></label>}

    <label>Due date<input type="date" required={!!draft.repeat} value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} /></label>
    <label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Task["priority"] })}>{["High", "Medium", "Low"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Task["status"] })}>{["Inbox", "Planned", "In Progress", "Waiting", "Done"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Subject<select value={addingSubject ? "__add_subject__" : (draft.subjectId ?? "")} onChange={(event) => { if (event.target.value === "__add_subject__") { setAddingSubject(true); return; } setAddingSubject(false); setDraft({ ...draft, subjectId: event.target.value || undefined, team: event.target.value ? "Study" : draft.team }); }}><option value="">No subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}<option value="__add_subject__">+ Add subject</option></select>{addingSubject && <div className="task-subject-add"><input autoFocus value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="Subject name" aria-label="New subject name" /><button type="button" className="secondary-button" onClick={() => { const name = newSubjectName.trim(); if (!name) return; const subject: Subject = { id: `subject-${Date.now()}`, name, color: "#9ee7d4", nextEvent: "No exam date", context: "New subject context. Add notes in its workspace." }; if (addSubject(subject)) { setDraft({ ...draft, subjectId: subject.id, team: "Study" }); setNewSubjectName(""); setAddingSubject(false); } }}>Add subject</button></div>}</label>
    <label><input type="checkbox" checked={!!draft.focused} onChange={(event) => setDraft({ ...draft, focused: event.target.checked })} /> Focus today</label>
    <button className="primary-button" type="submit">Save task</button>
  </form></div>;
}
