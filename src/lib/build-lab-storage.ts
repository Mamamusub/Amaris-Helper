export const projectTypes = ['Software', 'Hardware / IoT', 'Web', 'University', 'Personal', 'Research', 'Other'] as const;
export const projectStatuses = ['Idea', 'Planning', 'In Progress', 'On Hold', 'Completed', 'Archived'] as const;
export interface ProjectTask { id: string; projectId: string; title: string; category: string; priority: string; dueDate: string; completed: boolean; order: number }
export interface ProjectMilestone { id: string; projectId: string; title: string; targetDate: string; completed: boolean; notes: string }
export interface ProjectLog { id: string; projectId: string; title: string; content: string; tags: string[]; createdAt: string }
export interface ProjectResource { id: string; projectId: string; name: string; type: string; url: string }
export interface PortfolioInfo { resumeTitle: string; summary: string; role: string; technologies: string[]; result: string }
export interface Project {
 id: string; name: string; shortDescription: string; description: string; type: string; status: string; startDate: string; targetDate: string;
 manualProgress: number; autoProgress: boolean; repositoryUrl: string; demoUrl: string; documentationUrl: string; technologies: string[]; tags: string[]; nextTask: string;
 includeInResume: boolean; presentable: boolean; createdAt: string; updatedAt: string;
 tasks: ProjectTask[]; milestones: ProjectMilestone[]; logs: ProjectLog[]; resources: ProjectResource[]; portfolio: PortfolioInfo;
}
export const buildLabKey = 'agent-helper.build-lab';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export const splitTags = (value: string) => [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))];
export function newProject(id = crypto.randomUUID()): Project {
 const now = new Date().toISOString();
 return { id, name: '', shortDescription: '', description: '', type: 'Software', status: 'Idea', startDate: '', targetDate: '', manualProgress: 0, autoProgress: true, repositoryUrl: '', demoUrl: '', documentationUrl: '', technologies: [], tags: [], nextTask: '', includeInResume: false, presentable: false, createdAt: now, updatedAt: now, tasks: [], milestones: [], logs: [], resources: [], portfolio: { resumeTitle: '', summary: '', role: '', technologies: [], result: '' } };
}
export function progress(p: Project) { return p.autoProgress ? p.tasks.length ? Math.round(p.tasks.filter(t => t.completed).length / p.tasks.length * 100) : 0 : Math.max(0, Math.min(100, p.manualProgress)); }
export function safeProjectUrl(value: string) { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
export function readiness(p: Project) { return [
 ['Has description', !!(p.shortDescription.trim() || p.description.trim())], ['Has technology list', p.technologies.length > 0], ['Has GitHub repository', !!safeProjectUrl(p.repositoryUrl)],
 ['Has README/documentation', !!safeProjectUrl(p.documentationUrl) || p.resources.some(r => r.type === 'Documentation' && !!safeProjectUrl(r.url))], ['Has clear project result', !!p.portfolio.result.trim()], ['Project completed or presentable', p.status === 'Completed' || p.presentable],
 ] as [string, boolean][]; }
export function selectProjects(projects: Project[], query: string, status: string, type: string, technology: string, sort: string) {
 return projects.filter(p => (!status || p.status === status) && (!type || p.type === type) && (!technology || p.technologies.includes(technology)) && [p.name, p.shortDescription, p.description, ...p.tags, ...p.technologies].join(' ').toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => sort === 'Progress' ? progress(b)-progress(a) : sort === 'Project Name' ? a.name.localeCompare(b.name) : sort === 'Created Date' ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt));
}
export function readProjects(storage: StoragePort): Project[] {
 const raw = storage.getItem(buildLabKey); if (!raw) return [];
 const data = JSON.parse(raw);
 if (data?.version === 2 && Array.isArray(data.projects)) {
  const ids = new Set<string>();
  for (const p of data.projects) {
   validateProject(p);
   if (ids.has(p.id)) throw Error('Duplicate project IDs. Existing data has been preserved.');
   ids.add(p.id);
  }
  return data.projects;
 }
 if (!data || typeof data.name !== 'string' || typeof data.brief !== 'string') throw Error('Unrecognized Build Lab data. Existing data has been preserved.');
 const p = newProject('legacy-build-lab'); p.name = data.name; p.shortDescription = data.brief; p.description = typeof data.notes === 'string' ? data.notes : ''; p.technologies = typeof data.stack === 'string' ? data.stack.split(' + ') : []; p.status = 'Planning';
 p.createdAt = p.updatedAt = ''; // The original draft did not record dates.
 p.tasks = ['กำหนดผู้ใช้และปัญหาที่ต้องการแก้', 'เลือกฟีเจอร์หลักสำหรับเวอร์ชันแรก', 'ร่างหน้าจอและเส้นทางการใช้', 'สร้างต้นแบบด้วยข้อมูลตัวอย่าง', 'ทดสอบบนมือถือและตรวจการใช้งาน'].map((title, i) => ({ id: `legacy-task-${i}`, projectId: p.id, title, category: '', priority: 'Medium', dueDate: '', completed: Array.isArray(data.done) && data.done.includes(i), order: i }));
 return [p];
}
export function writeProjects(storage: StoragePort, next: Project[], expected: Project[]) {
 if (JSON.stringify(readProjects(storage)) !== JSON.stringify(expected)) throw Error('Projects changed elsewhere. Reload and try again.');
 next.forEach(validateProject);
 const previous = storage.getItem(buildLabKey);
 if (previous && !('version' in JSON.parse(previous)) && !storage.getItem(`${buildLabKey}.legacy-backup`)) storage.setItem(`${buildLabKey}.legacy-backup`, previous);
 storage.setItem(buildLabKey, JSON.stringify({ version: 2, projects: next }));
}

// Reject damaged records instead of silently replacing user content with defaults.
function validateProject(value: unknown): asserts value is Project {
 const fail = () => { throw Error('Project data is damaged. Existing data has been preserved.'); };
 const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
 const strings = (v: unknown) => Array.isArray(v) && v.every(item => typeof item === 'string');
 const p = record(value);
 const defaults = newProject('validation');
 for (const [key, sample] of Object.entries(defaults)) {
  if (typeof sample === 'string' && typeof p[key] !== 'string') fail();
  if (typeof sample === 'boolean' && typeof p[key] !== 'boolean') fail();
 }
 if (typeof p.manualProgress !== 'number' || !Number.isFinite(p.manualProgress) || !strings(p.technologies) || !strings(p.tags)) fail();
 const portfolio = record(p.portfolio);
 for (const key of ['resumeTitle', 'summary', 'role', 'result']) if (typeof portfolio[key] !== 'string') fail();
 if (!strings(portfolio.technologies)) fail();
 const childFields = { tasks: ['title', 'category', 'priority', 'dueDate'], milestones: ['title', 'targetDate', 'notes'], logs: ['title', 'content', 'createdAt'], resources: ['name', 'type', 'url'] };
 for (const [key, fields] of Object.entries(childFields)) {
  const children = p[key];
  if (!Array.isArray(children)) fail();
  const ids = new Set<string>();
  for (const child of children as unknown[]) {
   const item = record(child);
   for (const name of ['id', 'projectId', ...fields]) if (typeof item[name] !== 'string') fail();
   if (item.projectId !== p.id || ids.has(item.id as string)) fail();
   ids.add(item.id as string);
   if ((key === 'tasks' || key === 'milestones') && typeof item.completed !== 'boolean') fail();
   if (key === 'tasks' && (typeof item.order !== 'number' || !Number.isFinite(item.order))) fail();
   if (key === 'logs' && (!strings(item.tags) || !Number.isFinite(Date.parse(item.createdAt as string)))) fail();
  }
 }
}

