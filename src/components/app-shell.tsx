"use client";

import { FormEvent, useContext, useEffect, useState, useSyncExternalStore } from "react";
import PipelineView, { AIStatus } from "@/components/pipeline-view";
import { usePipeline } from "@/components/use-pipeline";
import DeadlineCalendar from "@/components/deadline-calendar";
import { CalendarReturnNotice, IntegrationSettings, TaskIntegrations } from "@/components/integrations";
import { agents, chooseRoute, getAgent, teamMeta } from "@/lib/agents";
import { CalendarEvent, eventDeadline, eventSubjectId, eventSubjectName } from "@/lib/calendar";
import { demoMessages, demoSubjects, demoTasks, readStorage, storageKeys, StoredMessages, writeStorage } from "@/lib/storage";
import { Agent, AgentRun, ChatMessage, PipelineImage, Subject, Task, Team } from "@/lib/types";

import { TaskContext, TaskControls, TaskEditor } from "@/components/task-controls";
import { liveTasks, todayTasks, updateTask, migrateTasks, sortTasksByDeadline } from "@/lib/task-model";
import { dayKey, calendarTimeZone } from "@/lib/calendar";

import AccountBoundary, { useCloud, useCloudSnapshot } from "@/components/account-boundary";

import SubjectNotes from "@/components/subject-notes";

import FocusAssignments from "@/components/focus-assignments";

import RecurringTasks, { GoLessonButton } from "@/components/recurring-tasks";

type View = "calendar" | "dashboard" | "teams" | "pipeline" | "tasks" | "study" | "career" | "development" | "settings";
const navItems: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Today", icon: "⌂" }, { id: "teams", label: "Team grid", icon: "◈" }, { id: "pipeline", label: "Pipeline", icon: "⌁" }, { id: "tasks", label: "Tasks", icon: "✓" }, { id: "calendar", label: "Calendar", icon: "▦" }, { id: "study", label: "Study", icon: "✦" }, { id: "career", label: "Career", icon: "↗" }, { id: "development", label: "Build lab", icon: "⌘" }, { id: "settings", label: "Settings", icon: "⚙" },
];

const teamOrder: Team[] = ["Orchestrator", "Shared", "Career", "Development"];
const today = dayKey(new Date());
const subscribeReady = () => () => {};

export default function AppShell() {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  return ready ? <AccountBoundary><LoadedAppShell /></AccountBoundary> : null;
}

function LoadedAppShell() {
  const cloud = useCloud();
  const synced = useCloudSnapshot();
  const [view, setView] = useState<View>("dashboard");
  const [calendarId, setCalendarId] = useState("");
  const [localTasks, setTasks] = useState<Task[]>(() => cloud ? [] : migrateTasks(readStorage(storageKeys.tasks, demoTasks), readStorage(storageKeys.subjects, demoSubjects)));
  const storedTasks = synced?.data.tasks ?? localTasks;
  const tasks = liveTasks(storedTasks);
  const [editorVersion, setEditorVersion] = useState(0);
  const [editor, setEditor] = useState<Task | null>(null);
  const [undoIds, setUndoIds] = useState<string[]>(() => storedTasks.filter((task) => task.deletedAt).sort((a, b) => a.deletedAt!.localeCompare(b.deletedAt!)).map((task) => task.id));
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [localSubjects, setSubjects] = useState<Subject[]>(() => cloud ? [] : readStorage(storageKeys.subjects, demoSubjects));
  const [localMessages, setLocalMessages] = useState<StoredMessages>(() => cloud ? {} : readStorage(storageKeys.messages, demoMessages));
  const subjects = synced?.data.subjects ?? localSubjects;
  const messages = synced?.data.messages ?? localMessages;
  const setMessages = (next: StoredMessages) => { const merged = { ...messages, ...next }; if (cloud) return cloud.enqueue("thread", merged); writeStorage(storageKeys.messages, merged); setLocalMessages(merged); return true; };
  const { runs, storageError, start: startPipeline, saveResponse } = usePipeline();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [notice, setNotice] = useState("");




  const openAgent = (agent: Agent) => setSelectedAgent(agent);
  const commitTasks = (next: Task[], expected?: Record<string, number>) => {
    if (cloud) return cloud.enqueue("task", next, expected);
    try { const original = window.localStorage.getItem(storageKeys.tasks); if (original && !window.localStorage.getItem(`${storageKeys.tasks}.legacy-backup`)) window.localStorage.setItem(`${storageKeys.tasks}.legacy-backup`, original); writeStorage(storageKeys.tasks, next); setTasks(next); setSaveError(""); return true; }
    catch { setSaveError("Could not save tasks. Free browser storage and try again."); return false; }
  };
  const commitSubjects = (next: Subject[]) => {
    if (cloud) return cloud.enqueue("subject", next);
    try { writeStorage(storageKeys.subjects, next); setSubjects(next); setSaveError(""); return true; }
    catch { setSaveError("Could not save subjects. Free browser storage and try again."); return false; }
  };
  const addTask = (task: Task) => { if (!storedTasks.some((item) => item.id === task.id)) commitTasks([task, ...storedTasks]); };
  const update = (id: string, patch: Partial<Task>) => { commitTasks(updateTask(storedTasks, id, patch)); };
  const create = (subjectId?: string, deadline = "", focused = false) => {
    const now = new Date().toISOString();
    setEditorVersion(0);
    setEditor({ id: crypto.randomUUID(), title: "", description: "", subjectId, deadline, focused, team: subjectId ? "Study" : "Orchestrator", assignedAgent: subjectId ?? "secretary", status: "Planned", priority: "Medium", createdAt: now, updatedAt: now });
  };
  const openSubject = (id: string) => { setSubjectId(id); setSelectedAgent(null); setView("study"); };
  const assignCalendarEvents = (events: CalendarEvent[]) => {
    const subjectMap = new Map(subjects.map((subject) => [subject.name.trim().toLowerCase(), subject.id]));
    const newSubjects: Subject[] = [];
    for (const event of events) {
      const name = eventSubjectName(event);
      const key = name.toLowerCase();
      if (!subjectMap.has(key)) {
        const subject = { id: eventSubjectId(name), name, color: "#9ee7d4", nextEvent: "From Google Calendar", context: "Imported from Google Calendar. Use this room to plan study time." };
        subjectMap.set(key, subject.id);
        newSubjects.push(subject);
      }
    }
    if (newSubjects.length && !commitSubjects([...subjects, ...newSubjects.filter((subject) => !subjects.some((item) => item.id === subject.id))])) return;
    const current = storedTasks;
    {
      const knownEvents = new Set(current.map((task) => task.sourceEventId).filter(Boolean));
      const now = new Date().toISOString();
      const additions = events.filter((event) => !knownEvents.has(event.id)).map((event) => ({ id: `google-primary:${event.id}`, sourceEventId: event.id, subjectId: subjectMap.get(eventSubjectName(event).toLowerCase()), title: event.title, description: event.description, deadline: eventDeadline(event), team: "Study" as const, assignedAgent: "researcher", status: "Planned" as const, priority: "Medium" as const, createdAt: now, updatedAt: now }));
      if (additions.length) commitTasks([...additions, ...current]);
    }
  };
  const routeRequest = (request: string, images: PipelineImage[] = []) => {
    const started = startPipeline(request, images);
    setView("pipeline");
    return started;
  };
  return <TaskContext.Provider value={{ subjects, update, create, edit: (task) => { setEditorVersion(cloud?.version("task", task.id) ?? 0); setEditor(task); }, openSubject, remove: (id) => { if (commitTasks(updateTask(storedTasks, id, { deletedAt: new Date().toISOString() }))) setUndoIds((ids) => [...ids, id]); } }}><div className="app-frame">
    <Sidebar view={view} setView={setView} taskCount={tasks.filter((task) => task.status !== "Done").length} />
    <main className="main-stage"><RecurringTasks tasks={storedTasks} save={(additions) => { if (cloud) cloud.import(additions.map((task) => ({ kind: "task", id: task.id, data: { ...task }, version: 0 }))); else commitTasks([...additions, ...storedTasks]); }} /><CalendarReturnNotice onSettings={() => setView("settings")} />
      <header className="topbar"><div><span className="eyebrow">PERSONAL AI TEAM / AMARIS</span><h1>{view === "dashboard" ? "Good morning, Pai." : (view === "settings" ? "Settings" : navItems.find((item) => item.id === view)?.label)}</h1></div><div className="topbar-actions"><span className="status-dot" /> <span className="muted">Personal workspace</span><button className="avatar-button" aria-label="Pai profile">P</button></div></header>
      {saveError && <div className="notice" role="alert">{saveError}</div>}
      {!!undoIds.length && <div className="notice" role="status">Task deleted <button onClick={() => { const id = undoIds[undoIds.length - 1]; if (commitTasks(updateTask(storedTasks, id, { deletedAt: undefined }))) setUndoIds((ids) => ids.slice(0, -1)); }}>Undo</button></div>}
      {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
      {view === "dashboard" && <Dashboard calendarId={calendarId} allTasks={storedTasks} onCreateTask={addTask} onViewTasks={() => setView("tasks")} tasks={tasks} runs={runs} onRoute={routeRequest} onOpenAgent={openAgent} />}
      {view === "teams" && <TeamGrid onOpenAgent={openAgent} />}
      {view === "pipeline" && <PipelineView runs={runs} onRoute={routeRequest} onSaveResponse={saveResponse} storageError={storageError} />}
      {view === "tasks" && <TaskTimelineView tasks={tasks} />}
      {view === "study" && <StudyAssignmentsView subjects={subjects} setSubjects={commitSubjects} tasks={tasks} onOpenAgent={openAgent} selectedSubjectId={subjectId} />}
      {view === "career" && <TeamView team="Career" onOpenAgent={openAgent} />}
      {view === "development" && <TeamView team="Development" onOpenAgent={openAgent} />}
      {view === "calendar" && <DeadlineCalendar selectedCalendarId={calendarId} onCalendarSelected={setCalendarId} tasks={storedTasks} subjects={subjects} onCreateTask={addTask} onAssignAll={assignCalendarEvents} onSettings={() => setView("settings")} />}
      {view === "settings" && <SettingsView />}
    </main>
    {selectedAgent && <AgentWorkspaceV3 agent={selectedAgent} messages={messages[selectedAgent.id] ?? []} setMessages={setMessages} onClose={() => setSelectedAgent(null)} onCreateTask={(task) => addTask({ ...task, subjectId: subjects.some((subject) => subject.id === selectedAgent.id) ? selectedAgent.id : task.subjectId })} onRoute={routeRequest} />}
    {editor && <TaskEditor tasks={storedTasks} recurringAction={!storedTasks.some((task) => task.id === editor.id) ? <GoLessonButton tasks={storedTasks} save={(additions) => { if (cloud) cloud.import(additions.map((task) => ({ kind: "task", id: task.id, data: { ...task }, version: 0 }))); else commitTasks([...additions, ...storedTasks]); }} /> : undefined} key={editor.id} task={editor} onClose={() => setEditor(null)} onSave={(task) => { const next = storedTasks.some((item) => item.id === task.id) ? updateTask(storedTasks, task.id, task) : [task, ...storedTasks]; if (commitTasks(next, { [task.id]: editorVersion })) setEditor(null); }} />}
  </div></TaskContext.Provider>;
}

function Sidebar({ view, setView, taskCount }: { view: View; setView: (view: View) => void; taskCount: number }) {
  return <aside className="sidebar"><div className="brand"><div className="brand-mark">✦</div><div><strong>Amaris</strong><span>Pai&apos;s AI team</span></div></div><div className="workspace-switcher"><span className="mini-mark">P</span><div><strong>Pai&apos;s workspace</strong><small>Local workspace</small></div><span className="chevron">⌄</span></div><nav aria-label="Main navigation">{navItems.map((item) => <button type="button" key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}{item.id === "tasks" && <b>{taskCount}</b>}</button>)}</nav><div className="sidebar-footer"><div className="local-badge"><span className="status-dot" /><div><strong>Local-first</strong><small>Tasks saved here</small></div></div></div></aside>;
}

function Dashboard({ calendarId, tasks, allTasks, onCreateTask, runs, onRoute, onOpenAgent, onViewTasks }: { calendarId: string; allTasks: Task[]; onCreateTask: (task: Task) => void; onViewTasks: () => void; tasks: Task[]; runs: AgentRun[]; onRoute: (request: string) => void; onOpenAgent: (agent: Agent) => void }) {
  const actions = useContext(TaskContext);
  const [currentDay, setCurrentDay] = useState(() => dayKey(new Date()));
  useEffect(() => { const timer = setInterval(() => setCurrentDay(dayKey(new Date())), 30000); return () => clearInterval(timer); }, []);
  const activeTasks = todayTasks(tasks, currentDay);
  return <div className="content"><section className="hero-grid"><div className="hero-copy"><span className="section-kicker">{new Intl.DateTimeFormat("en-US", { timeZone: calendarTimeZone, dateStyle: "full" }).format(new Date())}</span><h2>What deserves your<br /><em>attention</em> today?</h2><p>Your team has a clear view of the week. Start with the next small move.</p></div><div className="focus-card"><div className="focus-orbit"><span>◌</span><i>✦</i></div><div><span className="eyebrow">SUGGESTED NEXT</span><h3>{activeTasks[0]?.title ?? "No upcoming assignments"}</h3><p>{activeTasks[0] ? `${activeTasks[0].deadline ? `Due ${activeTasks[0].deadline}` : "No due date"} / ${activeTasks[0].priority} priority` : "Your focus list is clear"}</p><button className="text-button" onClick={() => activeTasks[0] ? actions.edit(activeTasks[0]) : onOpenAgent(getAgent("researcher")!)}>Open focus <span>↗</span></button></div></div></section><section className="ask-box"><div className="ask-icon">✦</div><div className="ask-input"><span>Ask your AI team...</span><small>Try “I want to improve my CV” or “What should I do today?”</small></div><button className="send-button" onClick={() => onRoute("What should I focus on today?")}>↗</button></section><div className="dashboard-grid"><section className="panel priority-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR FOCUS</span><h3>Your priorities today</h3></div><button className="icon-button" onClick={() => actions.create(undefined, "", true)}>+</button></div><FocusAssignments calendarId={calendarId} tasks={allTasks} onCreateTask={onCreateTask} /><button className="panel-link" onClick={onViewTasks}>View all tasks <span>↗</span></button></section><section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">LIVE HANDOFFS</span><h3>Agent activity</h3></div><span className="live-pill"><i /> live</span></div>{runs.length === 0 ? <div className="empty-activity"><div className="empty-orbit">◌</div><p>No active handoffs yet.</p><small>Ask your team to see delegation happen here.</small></div> : runs.slice(0, 3).map((run) => <div className="activity-row" key={run.id}><div className="activity-avatars">{run.selectedAgents.slice(0, 2).map((id) => <Avatar key={id} agent={getAgent(id)} small />)}</div><div><strong>{run.userRequest}</strong><small>{run.selectedAgents.length - 1} agents · just now</small></div><span className="activity-arrow">↗</span></div>)}</section></div><section className="bottom-strip"><div><span className="eyebrow">UP NEXT</span><strong>Upcoming deadlines</strong></div><div className="deadline-list">{tasks.filter((task) => task.status !== "Done" && task.deadline > currentDay && !activeTasks.some((focused) => focused.id === task.id)).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 3).map((task) => <div className="deadline" data-go-lesson={task.recurrence === "go-kus-thursday" || undefined} key={task.id}><span className="deadline-date">{task.deadline.slice(8)}<small>{task.deadline.slice(5, 7)}</small></span><div><strong>{task.title}</strong><small>{task.team} · {task.priority} priority</small></div></div>)}</div></section></div>;
}

function TeamGrid({ onOpenAgent }: { onOpenAgent: (agent: Agent) => void }) { return <div className="content"><div className="view-intro"><div><span className="section-kicker">YOUR AI TEAM / 10 AGENTS</span><h2>Everyone has a<br /><em>part to play.</em></h2></div><p>Specialists, not a chatbot collection. Each agent has a role, a context, and a handoff.</p></div><div className="team-grid">{teamOrder.map((team) => <section className="team-section" key={team}><div className="team-heading"><div><span className="eyebrow">{teamMeta[team].eyebrow}</span><h3>{teamMeta[team].label}</h3></div><span className="team-count">{agents.filter((agent) => agent.team === team).length} agents</span></div><div className="agent-cards">{agents.filter((agent) => agent.team === team).map((agent) => <AgentCard agent={agent} key={agent.id} onClick={() => onOpenAgent(agent)} />)}</div></section>)}</div></div>; }

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) { return <button className="agent-card" onClick={onClick}><div className="agent-card-top"><Avatar agent={agent} /><span className={`agent-status ${agent.status}`}><i />{agent.status}</span></div><div className="agent-card-body"><span className="team-tag">{agent.team}</span><h4>{agent.name}</h4><p>{agent.role}</p><small>{agent.description}</small></div><div className="agent-card-foot"><span>{agent.capabilities.slice(0, 2).join(" · ")}</span><b>↗</b></div></button>; }
function Avatar({ agent, small = false }: { agent?: Agent; small?: boolean }) { return <div className={small ? "avatar small" : "avatar"} role="img" aria-label={agent?.name ?? "Agent"} style={{ background: agent?.color ?? "#d7f36b", fontSize: agent && getAgent(agent.id) ? (small ? 16 : 30) : undefined }}>{agent?.avatar ?? "?"}</div>; }
function TaskRow({ task, index }: { task: Task; index: number }) { return <div className="task-row" data-go-lesson={task.recurrence === "go-kus-thursday" || undefined}><span className={`task-number n${index}`}>0{index + 1}</span><div className="task-info"><strong>{task.title}</strong><small>{task.team} · {task.deadline ? `Due ${task.deadline}` : "No due date"}</small></div><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></div>; }

function subjectAssignments(subject: Subject, tasks: Task[]) {
  return tasks.filter((task) => task.subjectId === subject.id);
}

type TaskFilter = "This week" | "Next week" | "Next month" | "All Tasks";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function taskRange(filter: Exclude<TaskFilter, "All Tasks">) {
  const reference = new Date(`${dayKey(new Date())}T12:00:00Z`);
  const mondayOffset = (reference.getUTCDay() + 6) % 7;
  const thisMonday = addDays(reference, -mondayOffset);
  if (filter === "This week") return [dateOnly(reference), dateOnly(addDays(thisMonday, 7))];
  if (filter === "Next week") { const nextMonday = addDays(thisMonday, 7); return [dateOnly(nextMonday), dateOnly(addDays(nextMonday, 7))]; }
  const nextMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  return [dateOnly(nextMonth), dateOnly(new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 1)))];
}

function TaskTimelineView({ tasks }: { tasks: Task[] }) {
  const actions = useContext(TaskContext);
  const [filter, setFilter] = useState<TaskFilter>("This week");
  const countFor = (item: TaskFilter) => item === "All Tasks" ? tasks.length : tasks.filter((task) => { if (task.status === "Done") return false; const [start, end] = taskRange(item); return task.deadline >= start && task.deadline < end; }).length;
  const shown = sortTasksByDeadline(filter === "All Tasks" ? tasks : tasks.filter((task) => { if (task.status === "Done") return false; const [start, end] = taskRange(filter); return task.deadline >= start && task.deadline < end; }));
  return <div className="content"><div className="view-intro compact"><div><span className="section-kicker">SHARED TASK SYSTEM</span><h2>Keep the promises<br /><em>visible.</em></h2></div><button className="primary-button" onClick={() => actions.create()}>+ New task</button></div><div className="tabs">{(["This week", "Next week", "Next month", "All Tasks"] as const).map((item) => <button className={filter === item ? "tab active" : "tab"} key={item} onClick={() => setFilter(item)}>{item}<span>{countFor(item)}</span></button>)}</div><section className="task-table">{shown.map((task) => <div className="task-table-row" data-go-lesson={task.recurrence === "go-kus-thursday" || undefined} key={task.id}><button className={`checkbox ${task.status === "Done" ? "checked" : ""}`} aria-label={`Mark ${task.title} ${task.status === "Done" ? "pending" : "done"}`} onClick={() => actions.update(task.id, { status: task.status === "Done" ? "Planned" : "Done" })}>{task.status === "Done" ? "✓" : ""}</button><div className="task-info"><strong>{task.title}</strong><small>{task.description}</small></div><span className="task-team">{task.team}</span><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><span className="task-deadline">{task.deadline}</span><TaskIntegrations task={task} /><TaskControls task={task} /></div>)}{shown.length === 0 && <div className="empty-state">Nothing here yet. A clear surface can be a useful thing.</div>}</section></div>;
}

void TasksView;

function StudyAssignmentsView({ subjects, setSubjects, tasks, onOpenAgent, selectedSubjectId }: { selectedSubjectId: string | null; subjects: Subject[]; setSubjects: (subjects: Subject[]) => boolean; tasks: Task[]; onOpenAgent: (agent: Agent) => void }) {
  const actions = useContext(TaskContext);
  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId);
  const [newSubject, setNewSubject] = useState("");
  const addSubject = (event: FormEvent) => { event.preventDefault(); if (!newSubject.trim()) return; setSubjects([...subjects, { id: `subject-${Date.now()}`, name: newSubject.trim(), color: "#9ee7d4", nextEvent: "No exam date", context: "New subject context. Add notes in its workspace." }]); setNewSubject(""); };
  return <div className="content"><div className="view-intro compact"><div><span className="section-kicker">STUDY TEAM / YOUR SUBJECTS</span><h2>Learn with<br /><em>context.</em></h2></div><button className="secondary-button" onClick={() => onOpenAgent(getAgent("researcher")!)}>Ask Owl ↗</button></div><div className="study-overview"><div className="study-stat"><span>UPCOMING EXAMS</span><strong>{subjects.length === 1 ? "1" : subjects.length}</strong><small>Keep dates close</small></div><div className="study-stat"><span>OPEN ASSIGNMENTS</span><strong>{tasks.filter((task) => task.subjectId && task.status !== "Done").length}</strong><small>Across your subjects</small></div><div className="study-stat highlight"><span>NEXT SUGGESTION</span><strong>25 min</strong><small>Review integration notes</small></div></div><section className="subject-section"><div className="panel-heading"><div><span className="eyebrow">SUBJECT AGENTS</span><h3>Your learning rooms</h3></div></div><div className="subject-grid">{subjects.map((subject) => { const assignments = subjectAssignments(subject, tasks).filter((task) => task.status !== "Done"); const nextAssignment = assignments.filter((task) => task.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0]; return <button className="subject-card" key={subject.id} onClick={() => actions.openSubject(subject.id)}><div className="subject-icon" style={{ background: subject.color }}>{subject.name.slice(0, 2).toUpperCase()}</div><h4>{subject.name}</h4><p>{subject.context}</p><span>{nextAssignment ? `${assignments.length} assignment${assignments.length === 1 ? "" : "s"} · Next ${nextAssignment.deadline}` : `${assignments.length} open assignments`} <b>↗</b></span></button>; })}<form className="add-subject" onSubmit={addSubject}><span>+</span><strong>Add subject</strong><input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="e.g. Digital logic" aria-label="New subject name" /><button type="submit">Create ↗</button></form></div></section>{selectedSubject && <section className="panel"><div className="panel-heading"><h3>{selectedSubject.name}</h3><button className="secondary-button" onClick={() => onOpenAgent({ id: selectedSubject.id, name: selectedSubject.name, team: "Study", role: "Subject specialist", avatar: selectedSubject.name.slice(0, 2).toUpperCase(), color: selectedSubject.color, description: selectedSubject.context, capabilities: ["Explain concepts", "Practice questions", "Exam review"], status: "online" })}>Open study room</button><button className="primary-button" onClick={() => actions.create(selectedSubject.id)}>+ New task</button></div><SubjectNotes key={selectedSubject.id} subject={selectedSubject} save={(next) => setSubjects(subjects.map((item) => item.id === next.id ? next : item))} />{subjectAssignments(selectedSubject, tasks).map((task) => <div className="subject-task" key={task.id}><TaskRow task={task} index={0} /><p>{task.description}</p><small>{task.status}</small><TaskControls task={task} /></div>)}{!subjectAssignments(selectedSubject, tasks).length && <p className="empty-state">No assignments yet.</p>}</section>}</div>;
}

function TasksView({ tasks, setTasks, onCreateTask }: { tasks: Task[]; setTasks: (tasks: Task[]) => void; onCreateTask: (task: Task) => void }) { const [filter, setFilter] = useState<"Today" | "Upcoming" | "All Tasks">("Today"); const shown = filter === "All Tasks" ? tasks : tasks.filter((task) => filter === "Today" ? task.status !== "Done" : task.status !== "Done" && task.deadline >= "2026-09-08"); return <div className="content"><div className="view-intro compact"><div><span className="section-kicker">SHARED TASK SYSTEM</span><h2>Keep the promises<br /><em>visible.</em></h2></div><button className="primary-button" onClick={() => onCreateTask({ id: `task-${Date.now()}`, title: "Untitled task", description: "Add a description when you are ready.", team: "Orchestrator", assignedAgent: "secretary", status: "Inbox", priority: "Medium", deadline: "2026-09-12", createdAt: today, updatedAt: today })}>+ New task</button></div><div className="tabs">{(["Today", "Upcoming", "All Tasks"] as const).map((item) => <button className={filter === item ? "tab active" : "tab"} key={item} onClick={() => setFilter(item)}>{item}<span>{item === "All Tasks" ? tasks.length : shown.length}</span></button>)}</div><section className="task-table">{shown.map((task) => <div className="task-table-row" data-go-lesson={task.recurrence === "go-kus-thursday" || undefined} key={task.id}><button className={`checkbox ${task.status === "Done" ? "checked" : ""}`} onClick={() => setTasks(tasks.map((item) => item.id === task.id ? { ...item, status: item.status === "Done" ? "Planned" : "Done" } : item))}>{task.status === "Done" ? "✓" : ""}</button><div className="task-info"><strong>{task.title}</strong><small>{task.description}</small></div><span className="task-team">{task.team}</span><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><span className="task-deadline">{task.deadline}</span><TaskIntegrations task={task} /></div>)}{shown.length === 0 && <div className="empty-state">Nothing here yet. A clear surface can be a useful thing.</div>}</section></div>; }

function StudyView({ subjects, setSubjects, tasks, onOpenAgent }: { subjects: Subject[]; setSubjects: (subjects: Subject[]) => void; tasks: Task[]; onOpenAgent: (agent: Agent) => void }) { const [newSubject, setNewSubject] = useState(""); const addSubject = (event: FormEvent) => { event.preventDefault(); if (!newSubject.trim()) return; setSubjects([...subjects, { id: `subject-${Date.now()}`, name: newSubject.trim(), color: "#9ee7d4", nextEvent: "No exam date", context: "New subject context. Add notes in its workspace." }]); setNewSubject(""); }; return <div className="content"><div className="view-intro compact"><div><span className="section-kicker">STUDY TEAM / YOUR SUBJECTS</span><h2>Learn with<br /><em>context.</em></h2></div><button className="secondary-button" onClick={() => onOpenAgent(getAgent("researcher")!)}>Ask Owl ↗</button></div><div className="study-overview"><div className="study-stat"><span>UPCOMING EXAMS</span><strong>{subjects.length === 1 ? "1" : subjects.length}</strong><small>Keep dates close</small></div><div className="study-stat"><span>OPEN ASSIGNMENTS</span><strong>{tasks.filter((task) => task.team === "Study" && task.status !== "Done").length}</strong><small>Small steps count</small></div><div className="study-stat highlight"><span>NEXT SUGGESTION</span><strong>25 min</strong><small>Review integration notes</small></div></div><section className="subject-section"><div className="panel-heading"><div><span className="eyebrow">SUBJECT AGENTS</span><h3>Your learning rooms</h3></div></div><div className="subject-grid">{subjects.map((subject) => <button className="subject-card" key={subject.id} onClick={() => onOpenAgent({ id: subject.id, name: subject.name, team: "Study", role: "Subject specialist", avatar: subject.name.slice(0, 2).toUpperCase(), color: subject.color, description: subject.context, capabilities: ["Explain concepts", "Practice questions", "Exam review"], status: "online" })}><div className="subject-icon" style={{ background: subject.color }}>{subject.name.slice(0, 2).toUpperCase()}</div><h4>{subject.name}</h4><p>{subject.context}</p><span>{subject.nextEvent} <b>↗</b></span></button>)}<form className="add-subject" onSubmit={addSubject}><span>+</span><strong>Add subject</strong><input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="e.g. Digital logic" aria-label="New subject name" /><button type="submit">Create ↗</button></form></div></section></div>; }

void StudyView;

function TeamView({ team, onOpenAgent }: { team: Team; onOpenAgent: (agent: Agent) => void }) { return <div className="content"><div className="view-intro compact"><div><span className="section-kicker">{team.toUpperCase()} TEAM</span><h2>Make your next<br /><em>move count.</em></h2></div><p>{team === "Career" ? "Turn your experience into a story that opens doors." : "Build with a focused partner for every layer of the idea."}</p></div><div className="feature-banner"><div><span className="eyebrow">TEAM BRIEF</span><h3>{team === "Career" ? "One strong application beats ten rushed ones." : "A small, legible plan is a technical advantage."}</h3><p>Choose the specialist who can make the next decision easier.</p></div><span className="banner-mark">✦</span></div><div className="agent-cards wide">{agents.filter((agent) => agent.team === team).map((agent) => <AgentCard key={agent.id} agent={agent} onClick={() => onOpenAgent(agent)} />)}</div></div>; }

function AgentWorkspace({ agent, messages, setMessages, onClose, onCreateTask, onRoute }: { agent: Agent; messages: ChatMessage[]; setMessages: (messages: StoredMessages) => void; onClose: () => void; onCreateTask: (task: Task) => void; onRoute: (request: string) => void }) { const [input, setInput] = useState(""); const send = (event: FormEvent) => { event.preventDefault(); if (!input.trim()) return; const content = input.trim(); const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() }; const response: ChatMessage = { id: `msg-${Date.now()}-reply`, role: "agent", content: agent.id === "secretary" ? `I can help make that concrete. I would route this toward ${chooseRoute(content).map((id) => getAgent(id)?.name).join(" and ")}. I have added the handoff to your Pipeline.` : `I have captured that. Let’s turn it into one clear next step, then review the result together.`, createdAt: new Date().toISOString() }; setMessages({  [agent.id]: [...messages, userMessage, response] }); if (agent.id === "secretary") onRoute(content); setInput(""); }; return <div className="workspace-overlay" role="dialog" aria-modal="true"><div className="workspace"><header className="workspace-header"><div className="workspace-agent"><Avatar agent={agent} /><div><span className="eyebrow">{agent.team} TEAM</span><h2>{agent.name}</h2><p>{agent.role}</p></div></div><button className="close-button" onClick={onClose}>×</button></header><div className="workspace-body"><div className="conversation">{messages.length === 0 && <div className="conversation-welcome"><Avatar agent={agent} /><h3>What are we moving forward?</h3><p>{agent.description}</p></div>}{messages.map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-label">{message.role === "user" ? "You" : agent.name}</div><div className="message-bubble">{message.content}</div></div>)}</div><aside className="workspace-aside"><span className="eyebrow">CAPABILITIES</span>{agent.capabilities.map((capability) => <div className="capability" key={capability}><span>✦</span>{capability}</div>)}<button className="aside-action" onClick={() => onCreateTask({ id: `task-${Date.now()}`, title: `Follow up with ${agent.name}`, description: "Created from agent workspace.", team: agent.team, assignedAgent: agent.id, status: "Inbox", priority: "Medium", deadline: "2026-09-12", createdAt: today, updatedAt: today })}>+ Create task</button></aside></div><form className="chat-composer" onSubmit={send}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={`Message ${agent.name}...`} /><button type="submit">↗</button></form></div></div>; }

function AgentWorkspaceV2({ agent, messages, setMessages, onClose, onCreateTask, onRoute }: { agent: Agent; messages: ChatMessage[]; setMessages: (messages: StoredMessages) => void; onClose: () => void; onCreateTask: (task: Task) => void; onRoute: (request: string) => void }) {
  const [input, setInput] = useState("");
  const [deadline, setDeadline] = useState("");
  const send = (event: FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: "user", content, createdAt: now };
    const response: ChatMessage = { id: `msg-${Date.now()}-reply`, role: "agent", content: `${agent.name} received your instruction. I can turn it into a task or send it to the Pipeline for a fuller handoff.`, createdAt: now };
    setMessages({  [agent.id]: [...messages, userMessage, response] });
    setInput("");
  };
  const createTask = () => {
    const title = input.trim() || `Work with ${agent.name}`;
    const now = new Date().toISOString();
    onCreateTask({ id: `task-${Date.now()}`, title, description: `Assigned directly to ${agent.name}.`, team: agent.team, assignedAgent: agent.id, status: "Planned", priority: "Medium", deadline, createdAt: now, updatedAt: now });
    const confirmation: ChatMessage = { id: `msg-${Date.now()}-task`, role: "agent", content: `Created a task for ${agent.name}: ${title}. Due ${deadline}.`, createdAt: now };
    setMessages({  [agent.id]: [...messages, confirmation] });
    setInput("");
  };
  return <div className="workspace-overlay" role="dialog" aria-modal="true"><div className="workspace"><header className="workspace-header"><div className="workspace-agent"><Avatar agent={agent} /><div><span className="eyebrow">{agent.team} TEAM</span><h2>{agent.name}</h2><p>{agent.role}</p></div></div><button className="close-button" onClick={onClose}>×</button></header><div className="workspace-body"><div className="conversation">{messages.length === 0 && <div className="conversation-welcome"><Avatar agent={agent} /><h3>What should {agent.name} work on?</h3><p>{agent.description}</p></div>}{messages.map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-label">{message.role === "user" ? "You" : agent.name}</div><div className="message-bubble">{message.content}</div></div>)}</div><aside className="workspace-aside"><span className="eyebrow">CAPABILITIES</span>{agent.capabilities.map((capability) => <div className="capability" key={capability}><span>✦</span>{capability}</div>)}<label className="workspace-deadline">Due date<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><button className="aside-action" onClick={createTask}>+ Create task</button><button className="aside-action" onClick={() => { const request = input.trim() || `Work on this with ${agent.name}`; onRoute(`${agent.name}: ${request}`); onClose(); }}>↗ Send to Pipeline</button></aside></div><form className="chat-composer" onSubmit={send}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={`Message ${agent.name}...`} aria-label={`Message ${agent.name}`} /><button className="send-button" type="submit" disabled={!input.trim()}>↗</button></form></div></div>;
}

void AgentWorkspace;
void AgentWorkspaceV2;

function AgentWorkspaceV3({ agent, messages, setMessages, onClose, onCreateTask, onRoute }: { agent: Agent; messages: ChatMessage[]; setMessages: (messages: StoredMessages) => void; onClose: () => void; onCreateTask: (task: Task) => void; onRoute: (request: string) => void }) {
  const [input, setInput] = useState("");
  const [deadline, setDeadline] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending) return;
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: "user", content, createdAt: now };
    const nextMessages = [...messages, userMessage];
    setMessages({  [agent.id]: nextMessages });
    setInput(""); setError(""); setPending(true);
    try {
      const response = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: agent.id, request: content, history: messages }), signal: AbortSignal.timeout(90000) });
      const data = await response.json() as { answer?: string; agentName?: string; routed?: boolean; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || "เอเจนต์ตอบไม่ได้ กรุณาลองใหม่");
      const answer = data.routed ? `${data.agentName} รับช่วงต่อจาก ${agent.name}\n\n${data.answer}` : data.answer;
      const reply: ChatMessage = { id: `msg-${Date.now()}-reply`, role: "agent", content: answer, createdAt: new Date().toISOString() };
      setMessages({  [agent.id]: [...nextMessages, reply] });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "เอเจนต์ตอบไม่ได้ กรุณาลองใหม่");
    } finally { setPending(false); }
  };
  const createTask = () => {
    const title = input.trim() || `Work with ${agent.name}`;
    const now = new Date().toISOString();
    onCreateTask({ id: `task-${Date.now()}`, title, description: `Assigned directly to ${agent.name}.`, team: agent.team, assignedAgent: agent.id, status: "Planned", priority: "Medium", deadline, createdAt: now, updatedAt: now });
    setInput("");
  };
  return <div className="workspace-overlay" role="dialog" aria-modal="true"><div className="workspace"><header className="workspace-header"><div className="workspace-agent"><Avatar agent={agent} /><div><span className="eyebrow">{agent.team} TEAM</span><h2>{agent.name}</h2><p>{agent.role}</p></div></div><button className="close-button" onClick={onClose}>×</button></header><div className="workspace-body"><div className="conversation">{messages.length === 0 && <div className="conversation-welcome"><Avatar agent={agent} /><h3>What should {agent.name} work on?</h3><p>{agent.description}</p></div>}{messages.map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-label">{message.role === "user" ? "You" : agent.name}</div><div className="message-bubble">{message.content}</div></div>)}{pending && <div className="message"><div className="message-label">{agent.name}</div><div className="message-bubble">กำลังคิดคำตอบ…</div></div>}{error && <p className="integration-feedback" role="alert">{error}</p>}</div><aside className="workspace-aside"><span className="eyebrow">CAPABILITIES</span>{agent.capabilities.map((capability) => <div className="capability" key={capability}><span>✦</span>{capability}</div>)}<label className="workspace-deadline">Due date<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><button className="aside-action" disabled={pending} onClick={createTask}>+ Create task</button><button className="aside-action" disabled={pending} onClick={() => { const request = input.trim() || `Work on this with ${agent.name}`; onRoute(`${agent.name}: ${request}`); onClose(); }}>↗ Send to Pipeline</button></aside></div><form className="chat-composer" onSubmit={send}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={pending ? `Waiting for ${agent.name}...` : `Message ${agent.name}...`} aria-label={`Message ${agent.name}`} disabled={pending} /><button className="send-button" type="submit" disabled={pending || !input.trim()}>↗</button></form></div></div>;
}

function SettingsView() { return <div className="content"><div className="view-intro compact"><div><span className="section-kicker">WORKSPACE SETTINGS</span><h2>Your data,<br /><em>your place.</em></h2></div></div><IntegrationSettings /><AIStatus /><section className="settings-list"><div><strong>Runtime</strong><span>Pipeline: copy to ChatGPT / agent chat is demo</span></div><div><strong>Storage</strong><span>Browser localStorage · ready for SQLite adapter</span></div><div><strong>AI provider</strong><span>ChatGPT / manual copy & paste</span><button className="secondary-button">Configure later</button></div></section><div className="pipeline-note"><span>i</span><p>This MVP keeps state on this device. The service boundaries are intentionally small so a real provider and SQLite repository can be added without rewriting the UI.</p></div></div>; }
