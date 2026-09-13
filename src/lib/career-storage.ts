export const applicationStatuses = ["Interested", "Preparing", "Applied", "Interview", "Offer", "Rejected"] as const;
export const skillLevels = ["Not started", "Learning", "Comfortable"] as const;
export const skillGroups = ["Programming", "Tools", "Backend", "CS Fundamentals", "Cybersecurity"] as const;
export const projectChecks = ["GitHub", "README", "Demo", "Screenshot", "Resume bullet"];
export const resumeChecks = ["Education", "Skills", "Projects", "Experience", "Contact"];
export type Application = { id: string; company: string; position: string; status: typeof applicationStatuses[number]; deadline: string; link: string; notes: string; location: string; sample?: boolean };
export type Project = { id: string; name: string; link: string; checks: boolean[]; sample?: boolean };
export type Skill = { id: string; name: string; group: string; level: typeof skillLevels[number] };
export type Resume = { id: string; name: string; status: "Draft" | "In review" | "Ready"; link: string; checks: boolean[]; updatedAt: string };
export type CareerData = { goal: { title: string; roles: string }; applications: Application[]; projects: Project[]; skills: Skill[]; resume: Resume[]; interview: { id: string; name: string; done: boolean }[] };
export type CareerSection = keyof CareerData;
export function careerDefaults(): CareerData {
  return {
    goal: { title: "Summer Internship 2027", roles: "Software Engineer / Backend / Cybersecurity" },
    applications: ["WD", "KBTG", "SCB TechX"].map((company, i) => ({ id: `sample-application-${i}`, company, position: "Software Engineer Intern", status: i === 0 ? "Preparing" : "Interested", deadline: "", link: "", notes: "ข้อมูลตัวอย่าง — ปรับตามบริษัทและตำแหน่งที่สนใจ", location: "", sample: true })),
    projects: ["ESP32 Alzheimer Monitor", "Stock Notifier", "McMahon Go Pairing", "Amaris Helper"].map((name, i) => ({ id: `sample-project-${i}`, name, link: "", checks: [false, false, false, false, false], sample: true })),
    skills: [["Python", "Programming"], ["C", "Programming"], ["Git", "Tools"], ["SQL", "Backend"], ["Docker", "Tools"], ["Data Structures", "CS Fundamentals"], ["OOP", "CS Fundamentals"], ["Linux", "Tools"], ["Networking", "CS Fundamentals"], ["Cybersecurity basics", "Cybersecurity"]].map(([name, group], i) => ({ id: `skill-${i}`, name, group, level: "Not started" })),
    resume: ["General", "Software", "Cybersecurity"].map((name, i) => ({ id: `resume-${i}`, name, status: "Draft", link: "", checks: [false, false, false, false, false], updatedAt: "" })),
    interview: ["Introduce yourself", "Explain your projects", "OOP", "Data Structures", "SQL", "Networking", "Behavioral questions"].map((name, i) => ({ id: `interview-${i}`, name, done: false })),
  };
}
export const careerKey = (scope: string, section: CareerSection) => `${scope}.career.${section}`;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof v[key] === "string");
const checks = (v: unknown) => Array.isArray(v) && v.length === 5 && v.every((item) => typeof item === "boolean");
function valid(section: CareerSection, value: unknown) {
  if (section === "goal") return obj(value) && strings(value, ["title", "roles"]);
  if (!Array.isArray(value) || !value.every((item) => obj(item) && typeof item.id === "string")) return false;
  if (new Set(value.map((item) => item.id)).size !== value.length) return false;
  return value.every((item) => {
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
    Object.assign(data, { [section]: parsed });
  }
  return data;
}
export function writeCareer<K extends CareerSection>(storage: Pick<Storage, "getItem" | "setItem">, scope: string, section: K, next: CareerData[K], expected: CareerData[K]) {
  if (!valid(section, next)) throw new Error("ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบฟอร์ม");
  const current = readCareer(storage, scope)[section];
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error("ข้อมูลเปลี่ยนในอีกแท็บ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่");
  storage.setItem(careerKey(scope, section), JSON.stringify(next));
}
export const completion = (values: boolean[]) => values.length ? Math.round(values.filter(Boolean).length / values.length * 100) : 0;
export const projectStatus = (project: Project) => project.checks.every(Boolean) ? "Ready" : project.checks.some(Boolean) ? "In progress" : "Needs work";
export function careerReadiness(data: CareerData) {
  const resume = completion(data.resume.flatMap((item) => item.checks));
  const portfolio = completion(data.projects.flatMap((item) => item.checks));
  const skills = completion(data.skills.map((item) => item.level === "Comfortable"));
  const applications = completion(data.applications.map((item) => ["Applied", "Interview", "Offer", "Rejected"].includes(item.status)));
  return { resume, portfolio, skills, applications, total: Math.round((resume + portfolio + skills + applications) / 4), readyProjects: data.projects.filter((item) => projectStatus(item) === "Ready").length, coveredSkills: data.skills.filter((item) => item.level === "Comfortable").length };
}
export function safeCareerUrl(value: string) { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
