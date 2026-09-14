export const applicationStatuses = ["Interested", "Preparing", "Applied", "Interview", "Offer", "Rejected"] as const;
export const skillLevels = ["Not started", "Learning", "Comfortable"] as const;
export const skillGroups = ["Programming", "Tools", "Backend", "CS Fundamentals", "Cybersecurity"] as const;
export const projectChecks = ["GitHub", "README", "Demo", "Screenshot", "Resume bullet"];
export const resumeChecks = ["Education", "Skills", "Projects", "Experience", "Contact", "Links", "Spelling", "PDF ready"];
export type Check = boolean | "na";
export type Application = { appliedDate?: string; interviewDate?: string; followUpDate?: string; nextAction?: string; nextActionDate?: string; resumeId?: string; internshipPeriod?: string; arrangement?: string; requirements?: string; id: string; company: string; position: string; status: typeof applicationStatuses[number]; deadline: string; link: string; notes: string; location: string; sample?: boolean };
export type Project = { description?: string; role?: string; techStack?: string; readmeUrl?: string; demoUrl?: string; screenshotUrl?: string; resumeBullet?: string; outcome?: string; id: string; name: string; link: string; checks: Check[]; sample?: boolean };
export type Skill = { criteria?: string; evidence?: string; nextPractice?: string; id: string; name: string; group: string; level: typeof skillLevels[number] };
export type Resume = { language?: string; targetRole?: string; documentUpdatedAt?: string; id: string; name: string; status: "Draft" | "In review" | "Ready"; link: string; checks: Check[]; updatedAt: string };
export type CareerData = { goal: { title: string; roles: string; resumeId?: string; projectIds?: string[]; skillIds?: string[] }; applications: Application[]; projects: Project[]; skills: Skill[]; resume: Resume[]; interview: { id: string; name: string; done: boolean; notes?: string; practicedAt?: string; blockers?: string; situation?: string; task?: string; action?: string; result?: string }[] };
export type CareerSection = keyof CareerData;
export function careerDefaults(): CareerData {
  return {
    goal: { title: "Summer Internship 2027", roles: "Software Engineer / Backend / Cybersecurity" },
    applications: ["WD", "KBTG", "SCB TechX"].map((company, i) => ({ id: `sample-application-${i}`, company, position: "Software Engineer Intern", status: i === 0 ? "Preparing" : "Interested", deadline: "", link: "", notes: "ข้อมูลตัวอย่าง — ปรับตามบริษัทและตำแหน่งที่สนใจ", location: "", sample: true })),
    projects: ["ESP32 Alzheimer Monitor", "Stock Notifier", "McMahon Go Pairing", "Amaris Helper"].map((name, i) => ({ id: `sample-project-${i}`, name, link: "", checks: [false, false, false, false, false], sample: true })),
    skills: [["Python", "Programming"], ["C", "Programming"], ["Git", "Tools"], ["SQL", "Backend"], ["Docker", "Tools"], ["Data Structures", "CS Fundamentals"], ["OOP", "CS Fundamentals"], ["Linux", "Tools"], ["Networking", "CS Fundamentals"], ["Cybersecurity basics", "Cybersecurity"]].map(([name, group], i) => ({ id: `skill-${i}`, name, group, level: "Not started" })),
    resume: ["General", "Software", "Cybersecurity"].map((name, i) => ({ id: `resume-${i}`, name, status: "Draft", link: "", checks: Array(8).fill(false), updatedAt: "" })),
    interview: ["Introduce yourself", "Explain your projects", "OOP", "Data Structures", "SQL", "Networking", "Behavioral questions"].map((name, i) => ({ id: `interview-${i}`, name, done: false })),
  };
}
export const careerKey = (scope: string, section: CareerSection) => `${scope}.career.${section}`;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof v[key] === "string");
const checks = (v: unknown) => Array.isArray(v) && v.length >= 5 && v.length <= 8 && v.every((item) => typeof item === "boolean" || item === "na");
function valid(section: CareerSection, value: unknown) {
  if (section === "goal") return obj(value) && strings(value, ["title", "roles"]) && (value.resumeId === undefined || typeof value.resumeId === "string") && ["projectIds", "skillIds"].every(key => value[key] === undefined || (Array.isArray(value[key]) && value[key].every((id: unknown) => typeof id === "string")));
  if (!Array.isArray(value) || !value.every((item) => obj(item) && typeof item.id === "string")) return false;
  if (new Set(value.map((item) => item.id)).size !== value.length) return false;
  return value.every((item) => {
    if (!extraFields[section].every(key => item[key] === undefined || typeof item[key] === "string")) return false;
    if (section === "applications") return strings(item, ["company", "position", "deadline", "link", "notes", "location"]) && applicationStatuses.includes(item.status);
    if (section === "projects") return strings(item, ["name", "link"]) && checks(item.checks);
    if (section === "resume") return strings(item, ["name", "link", "updatedAt"]) && ["Draft", "In review", "Ready"].includes(item.status) && checks(item.checks);
    if (section === "skills") return strings(item, ["name", "group"]) && skillLevels.includes(item.level);
    return strings(item, ["name"]) && typeof item.done === "boolean";
  });
}
export function readCareer(storage: Pick<Storage, "getItem">, scope: string): CareerData {
  const data = careerDefaults();
  for (const section of Object.keys(data) as CareerSection[]) {
    const raw = storage.getItem(careerKey(scope, section));
    if (raw === null) continue;
    const parsed: unknown = JSON.parse(raw);
    if (!valid(section, parsed)) throw new Error(`อ่านข้อมูล ${section} ไม่สำเร็จ ข้อมูลเดิมยังอยู่ในเบราว์เซอร์`);
    Object.assign(data, { [section]: migrateSection(section, parsed) });
  }
  for (const section of Object.keys(data) as CareerSection[]) Object.assign(data, { [section]: migrateSection(section, data[section]) });
  return data;
}
export function writeCareer<K extends CareerSection>(storage: Pick<Storage, "getItem" | "setItem">, scope: string, section: K, next: CareerData[K], expected: CareerData[K]) {
  if (!valid(section, next)) throw new Error("ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบฟอร์ม");
  const current = readCareer(storage, scope)[section];
  if (JSON.stringify(current) !== JSON.stringify(migrateSection(section, expected))) throw new Error("ข้อมูลเปลี่ยนในอีกแท็บ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่");
  storage.setItem(careerKey(scope, section), JSON.stringify(migrateSection(section, next)));
}

export const extraFields: Record<CareerSection, string[]> = {
 goal: [], applications: ["appliedDate", "interviewDate", "followUpDate", "nextAction", "nextActionDate", "resumeId", "internshipPeriod", "arrangement", "requirements"],
 projects: ["description", "role", "techStack", "readmeUrl", "demoUrl", "screenshotUrl", "resumeBullet", "outcome"],
 resume: ["language", "targetRole", "documentUpdatedAt"], skills: ["criteria", "evidence", "nextPractice"], interview: ["notes", "practicedAt", "blockers", "situation", "task", "action", "result"]
};
export function migrateSection(section: CareerSection, value: unknown): unknown {
 if (section === "goal") return value;
 return (value as Record<string, unknown>[]).map(item => ({ ...Object.fromEntries(extraFields[section].map(key => [key, ""])), ...item, ...(section === "resume" ? { checks: [...item.checks as Check[], ...Array(Math.max(0, 8 - (item.checks as Check[]).length)).fill(false)] } : {}) }));
}
export const counted = (values: Check[]) => values.filter(value => value !== "na");
export const completion = (values: Check[]) => counted(values).length ? Math.round(counted(values).filter(value => value === true).length / counted(values).length * 100) : 0;
export const projectStatus = (project: Project) => completion(project.checks) === 100 ? "Ready" : project.checks.some(value => value === true) ? "In progress" : "Needs work";
export function careerReadiness(data: CareerData) {
 const resumes = data.resume.filter(item => item.id === (data.goal.resumeId ?? data.resume[0]?.id));
 const projects = data.projects.filter(item => (data.goal.projectIds ?? data.projects.map(p => p.id)).includes(item.id));
 const selectedSkills = data.skills.filter(item => (data.goal.skillIds ?? data.skills.map(s => s.id)).includes(item.id));
 const resume = completion(resumes.flatMap(item => item.checks)), portfolio = completion(projects.flatMap(item => item.checks)), skills = completion(selectedSkills.map(item => item.level === "Comfortable"));
 const applications = data.applications.filter(item => ["Applied", "Interview", "Offer", "Rejected"].includes(item.status)).length;
 return { resume, portfolio, skills, applications, total: Math.round((resume + portfolio + skills) / 3), resumeCount: counted(resumes.flatMap(item => item.checks)).length, projectCount: counted(projects.flatMap(item => item.checks)).length, skillCount: selectedSkills.length, readyProjects: projects.filter(item => projectStatus(item) === "Ready").length, coveredSkills: selectedSkills.filter(item => item.level === "Comfortable").length };
}
export function applicationDates(app: Application) {
 return [{ label: "Deadline", date: app.deadline }, { label: "Interview", date: app.interviewDate ?? "" }, { label: "Follow-up", date: app.followUpDate ?? "" }, { label: app.nextAction || "Next action", date: app.nextActionDate ?? "" }].filter(item => item.date && Number.isFinite(Date.parse(item.date))).sort((a,b) => a.date.localeCompare(b.date));
}
export function careerDate(value: string, now = new Date()) {
 if (!value || !Number.isFinite(Date.parse(value))) return "No date";
 const date = new Date(value.length === 10 ? value + "T00:00:00" : value);
 const days = Math.round((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()) - Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())) / 86400000);
 return date.toLocaleDateString("th-TH") + (value.includes("T") ? " " + date.toLocaleTimeString("th-TH", {hour:"2-digit",minute:"2-digit"}) : "") + " · " + (days < 0 ? "เลยกำหนด " + -days + " วัน" : days === 0 ? "วันนี้" : "อีก " + days + " วัน");
}
export const careerTaskId = (section: string, id: string, title: string) => {
 // Keep IDs within the existing workspace's 200-character limit, even for Thai notes.
 let hash = BigInt("14695981039346656037");
 for (const char of title.trim().toLowerCase()) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * BigInt("1099511628211"));
 return `career:${section}:${id}:${hash.toString(16)}`;
};
export function safeCareerUrl(value: string) { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
