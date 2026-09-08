import { Agent, Team } from "./types";

export const agents: Agent[] = [
  { id: "secretary", name: "Panda", team: "Orchestrator", role: "Personal AI secretary", avatar: "🐼", color: "#d7f36b", description: "Keeps your week moving by turning loose intentions into a focused plan.", capabilities: ["Route requests", "Plan your day", "Delegate work", "Track deadlines"], status: "online" },
  { id: "researcher", name: "Owl", team: "Shared", role: "Evidence & synthesis", avatar: "🦉", color: "#9ee7d4", description: "Turns open questions into concise, source-aware research briefs.", capabilities: ["Research plans", "Summaries", "Fact checking"], status: "focused" },
  { id: "reviewer", name: "Eagle", team: "Shared", role: "Quality partner", avatar: "🦅", color: "#e5c7ff", description: "Checks whether an answer is clear, correct, and useful before it reaches you.", capabilities: ["Logic checks", "Clarity review", "Actionable feedback"], status: "idle" },
  { id: "career-coach", name: "Dog", team: "Career", role: "Internship strategist", avatar: "🐶", color: "#ffbf7d", description: "Builds a practical path from your current skills to your next opportunity.", capabilities: ["CV strategy", "Skill gaps", "Interview prep", "Portfolio plans"], status: "online" },
  { id: "cv-reviewer", name: "Cat", team: "Career", role: "Resume editor", avatar: "🐱", color: "#f6d887", description: "Sharpens resume bullets into evidence of impact without exaggeration.", capabilities: ["Bullet rewrites", "ATS clarity", "Structure review"], status: "focused" },
  { id: "project-ideas", name: "Fox", team: "Career", role: "Portfolio scout", avatar: "🦊", color: "#f3a7c4", description: "Finds buildable projects that make your interests visible to employers.", capabilities: ["Idea generation", "Tech stacks", "Learning roadmaps"], status: "idle" },
  { id: "product-planner", name: "Bee", team: "Development", role: "MVP architect", avatar: "🐝", color: "#a8c7ff", description: "Turns a promising idea into a small, buildable product plan.", capabilities: ["Requirements", "Milestones", "Scope control"], status: "online" },
  { id: "web-developer", name: "Beaver", team: "Development", role: "Implementation partner", avatar: "🦫", color: "#92d7f0", description: "Helps you choose an architecture and get unstuck in the code.", capabilities: ["Architecture", "Debugging", "Implementation"], status: "focused" },
  { id: "uiux", name: "Butterfly", team: "Development", role: "Experience designer", avatar: "🦋", color: "#ffb3a7", description: "Makes workflows feel obvious, humane, and satisfying to use.", capabilities: ["Flows", "Layouts", "Interaction ideas"], status: "idle" },
  { id: "code-reviewer", name: "Octopus", team: "Development", role: "Maintainability partner", avatar: "🐙", color: "#bdc8a0", description: "Looks for bugs, accidental complexity, and the next clean refactor.", capabilities: ["Bug finding", "Refactoring", "Maintainability"], status: "online" },
];

export const teamMeta: Record<Team, { label: string; eyebrow: string }> = {
  Orchestrator: { label: "The control room", eyebrow: "01 / command" },
  Shared: { label: "Shared specialists", eyebrow: "02 / support" },
  Study: { label: "Study team", eyebrow: "03 / university" },
  Career: { label: "Career team", eyebrow: "04 / opportunity" },
  Development: { label: "Build team", eyebrow: "05 / projects" },
};

export const getAgent = (id: string) => agents.find((agent) => agent.id === id);

export function chooseRoute(request: string) {
  const normalized = request.toLowerCase();
  if (/cv|resume|intern|interview|portfolio|career|job|เรซูเม่|สมัครงาน|สัมภาษณ์|พอร์ต|อาชีพ/.test(normalized)) return ["career-coach", "cv-reviewer"];
  if (/code|bug|website|web|app|build|project|program|โค้ด|บั๊ก|เว็บ|แอป|สร้างระบบ|โปรเจกต์|โปรแกรม/.test(normalized)) return ["product-planner", "web-developer", "uiux"];
  if (/study|exam|homework|calculus|physics|assignment|subject|เรียน|สอบ|การบ้าน|แคลคูลัส|ฟิสิกส์|วิชา|งานที่ได้รับมอบหมาย/.test(normalized)) return ["researcher", "reviewer"];
  return ["researcher", "reviewer"];
}

export function routeSummary(request: string, selectedAgents: string[]) {
  const first = getAgent(selectedAgents[0]);
  return `Panda routed this request to ${first?.name ?? "a specialist"} because it needs ${first?.role.toLowerCase() ?? "focused support"}.`;
}
