export type Team = "Orchestrator" | "Shared" | "Study" | "Career" | "Development";
export type AgentStatus = "online" | "focused" | "idle";
export type TaskStatus = "Inbox" | "Planned" | "In Progress" | "Waiting" | "Done";
export type Priority = "High" | "Medium" | "Low";

export type Agent = {
  id: string;
  name: string;
  team: Team;
  role: string;
  avatar: string;
  color: string;
  description: string;
  capabilities: string[];
  status: AgentStatus;
};

export type FocusRecord = {
  id: string; startedAt: number; endedAt: number; elapsedMs: number; note: string;
  intervals?: { start: number; end: number }[];
  snapshot?: { taskTitle: string; subjectId: string | null; subjectName: string | null; subjectColor?: string };
  durationMs?: number;
  pausedMs?: number;
  outcome?: "completed" | "ended-early";
};

export type Task = {
  repeat?: { frequency: "daily" | "weekly" | "monthly"; weekdays: number[]; anchor: string; until?: string; timeZone: string };
  seriesId?: string;
  occurrenceDate?: string;
  recurrenceHandled?: boolean;
  skipBefore?: string;
  nextTemplate?: Pick<Task, "title" | "description" | "subtasks" | "repeat" | "color" | "priority" | "subjectId" | "team" | "assignedAgent">;
  deletionBatch?: string;
  recurrenceWasHandled?: boolean;
  focusSessions?: FocusRecord[];
  recurrence?: "go-kus-thursday";
  goKusDescriptionVersion?: 1;
  id: string;
  title: string;
  color?: string;
  description: string;
  team: Team;
  assignedAgent: string;
  status: TaskStatus;
  priority: Priority;
  deadline: string;
  createdAt: string;
  updatedAt: string;
  parentTaskId?: string;
  subtasks?: { id: string; title: string; done: boolean }[];
  focused?: boolean;
  deletedAt?: string;
  sourceEventId?: string;
  subjectId?: string;
};

export type Subject = {
  id: string;
  name: string;
  color: string;
  nextEvent: string;
  context: string;
  deletedAt?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
};

export type PipelineStep = {
  id: string;
  agentId: string;
  task: string;
  status: "Complete" | "Working" | "Queued" | "Failed" | "Cancelled";
  output: string;
};

export type AgentRun = {
  id: string;
  userRequest: string;
  selectedAgents: string[];
  steps: PipelineStep[];
  finalResponse: string;
  createdAt: string;
  images?: PipelineImage[];
  prompt?: string;
  status?: "AwaitingResponse" | "Running" | "Complete" | "Failed" | "Cancelled" | "Interrupted";
  provider?: string;
  error?: string;
};

export type PipelineUpdate = Pick<AgentRun, "steps" | "selectedAgents" | "finalResponse" | "status" | "provider" | "error">;

export type PipelineImage = { id: string; name: string; dataUrl: string; size: number };
