import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/career-storage.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, URL });
const { careerDefaults, careerReadiness, readCareer, writeCareer, careerKey, safeCareerUrl, projectStatus } = mod.exports;
function memory() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
test("fresh Career uses only minimal generic examples and useful preparation defaults", () => {
 const defaults = careerDefaults(); const storage = memory(); const data = readCareer(storage, "fresh");
 assert.equal(defaults.applications.length, 1); assert.equal(defaults.projects.length, 1);
 const app = data.applications[0];
 for (const [key, value] of Object.entries({company:"Example Company",position:"Software Engineer Intern",field:"Software Engineering",location:"Bangkok",internshipPeriod:"Nov 2026",status:"Interested",sample:true})) assert.equal(app[key], value);
 assert.equal(data.projects[0].name, "Personal Web Project"); assert.equal(data.projects[0].sample, true);
 assert.equal(data.goal.title, "Internship Preparation");
 assert.ok(data.resume.length); assert.ok(data.skills.length); assert.ok(data.interview.length);
 assert.equal(careerReadiness(data).total, 0);
 for (const section of Object.keys(defaults)) assert.equal(storage.getItem(careerKey("fresh", section)), null);
});

test("new seeds never replace saved records, including old samples, custom goals and empty lists", () => {
 const storage = memory(); const saved = careerDefaults();
 saved.goal = {title:"My saved internship goal",roles:"My chosen role"};
 saved.applications = [0,1,2].map(i => ({...saved.applications[0],id:`sample-application-${i}`,company:`Previously saved company ${i}`,notes:`Saved note ${i}`,sample:i === 0}));
 saved.projects = [0,1,2,3].map(i => ({...saved.projects[0],id:`sample-project-${i}`,name:`Previously saved project ${i}`,sample:true}));
 const snapshots = Object.entries(saved).map(([section,value]) => [section, JSON.stringify(value)]);
 for (const [section,raw] of snapshots) storage.setItem(careerKey("existing",section),raw);
 const loaded = readCareer(storage,"existing");
 assert.equal(JSON.stringify(loaded.goal),JSON.stringify(saved.goal));
 assert.equal(loaded.applications.length,3); assert.equal(loaded.projects.length,4);
 saved.applications.forEach((app,i) => {assert.equal(loaded.applications[i].company,app.company);assert.equal(loaded.applications[i].notes,app.notes);assert.equal(loaded.applications[i].sample,app.sample);});
 saved.projects.forEach((project,i) => assert.equal(loaded.projects[i].name,project.name));
 for (const [section,raw] of snapshots) assert.equal(storage.getItem(careerKey("existing",section)),raw);
 for (const section of ["applications","projects","resume","skills","interview"]) storage.setItem(careerKey("empty",section),"[]");
 const empty = readCareer(storage,"empty");
 for (const section of ["applications","projects","resume","skills","interview"]) assert.equal(empty[section].length,0);
});
test("readiness is deterministic, zero initially and 100 when all three preparation groups are complete", () => {
  const data = careerDefaults(); assert.equal(careerReadiness(data).total, 0);
  data.resume.forEach((item) => item.checks.fill(true));
  assert.equal(careerReadiness(data).total, 33);
  data.projects.forEach((item) => item.checks.fill(true));
  data.skills.forEach((item) => item.level = "Comfortable");
  data.applications.forEach((item) => item.status = "Rejected");
  assert.equal(careerReadiness(data).total, 100); assert.equal(careerReadiness(data).readyProjects, 1);
  assert.equal(projectStatus({ checks: [true, false, false, false, false] }), "In progress");
  assert.equal(projectStatus({ checks: [false, false, false, false, false] }), "Needs work");
  data.applications = []; data.resume = []; data.projects = []; data.skills = [];
  assert.equal(careerReadiness(data).total, 0);
});
test("add, edit and delete persist across reload without reviving examples or crossing accounts", () => {
  const storage = memory(), scope = "account-one";
  let data = readCareer(storage, scope);
  const next = [...data.applications, { id: "real", company: "Company", position: "Backend intern", status: "Applied", deadline: "2027-01-20", link: "https://example.com/jobs", notes: "Follow up", location: "Bangkok" }];
  writeCareer(storage, scope, "applications", next, data.applications);
  data = readCareer(storage, scope); assert.equal(data.applications.at(-1).company, "Company");
  const edited = data.applications.map((item) => item.id === "real" ? { ...item, status: "Interview" } : item);
  writeCareer(storage, scope, "applications", edited, data.applications);
  assert.equal(readCareer(storage, scope).applications.at(-1).status, "Interview");
  writeCareer(storage, scope, "applications", [], edited);
  assert.equal(readCareer(storage, scope).applications.length, 0);
  assert.equal(readCareer(storage, "account-two").applications.length, 1);
});
test("corrupt data, storage failures and stale edits never overwrite existing data", () => {
  const storage = memory(); const data = readCareer(storage, "local");
  const changed = { ...data.goal, title: "New goal" };
  writeCareer(storage, "local", "goal", changed, data.goal);
  assert.throws(() => writeCareer(storage, "local", "goal", data.goal, data.goal));
  assert.equal(readCareer(storage, "local").goal.title, "New goal");
  storage.setItem(careerKey("local", "skills"), "broken");
  assert.throws(() => readCareer(storage, "local"));
  assert.throws(() => writeCareer(storage, "local", "goal", data.goal, changed));
  const failed = { getItem: () => null, setItem: () => { throw Error("quota"); } };
  assert.throws(() => writeCareer(failed, "local", "goal", changed, data.goal));
});
test("checklists, skill levels and resume links persist; only web links are navigable", () => {
  const storage = memory(); let data = readCareer(storage, "local");
  const resume = data.resume.map((item) => ({ ...item, link: "https://example.com/resume.pdf", updatedAt: "2026-09-14T00:00:00Z", checks: [true, true, false, false, false] }));
  writeCareer(storage, "local", "resume", resume, data.resume);
  const skills = data.skills.map((item) => ({ ...item, level: "Learning" }));
  writeCareer(storage, "local", "skills", skills, data.skills);
  data = readCareer(storage, "local"); assert.equal(data.resume[0].checks.filter(Boolean).length, 2); assert.equal(data.skills[0].level, "Learning");
  for (const link of ["javascript:alert(1)", "data:text/html,hello", "/relative", ""]) assert.equal(safeCareerUrl(link), null);
  assert.equal(safeCareerUrl("https://example.com"), "https://example.com/");
});

test("legacy migration preserves evidence, adds defaults and separates document dates", () => {
 const storage = memory(); const legacy = careerDefaults(); legacy.resume[0].checks = [true,false,true,true,false];
 for (const [section,value] of Object.entries(legacy)) storage.setItem(careerKey("legacy",section),JSON.stringify(value));
 const data = readCareer(storage,"legacy");
 assert.equal(data.applications[0].nextAction, ""); assert.equal(data.resume[0].checks.length,8); assert.equal(data.resume[0].checks[2],true);
 assert.equal(data.resume[0].documentUpdatedAt, ""); assert.equal(data.projects[0].sample,true);
 const edited = data.resume.map(item => ({...item, checks:item.checks.map(() => true), updatedAt:"2026-09-14"}));
 writeCareer(storage,"legacy","resume",edited,data.resume); assert.equal(readCareer(storage,"legacy").resume[0].documentUpdatedAt, "");
});
test("selected evidence ignores spare drafts and applications; all N/A stays zero", () => {
 const data = careerDefaults(); data.goal.resumeId = data.resume[0].id; data.goal.projectIds = [data.projects[0].id]; data.goal.skillIds = [data.skills[0].id];
 data.resume[0].checks.fill(true); data.projects[0].checks.fill(true); data.skills[0].level = "Comfortable";
 assert.equal(careerReadiness(data).total,100); data.applications.push({...data.applications[0],id:"spare"}); assert.equal(careerReadiness(data).total,100);
 data.resume[0].checks.fill("na"); data.projects[0].checks.fill("na"); data.goal.skillIds = [];
 assert.equal(careerReadiness(data).total,0); assert.equal(projectStatus(data.projects[0]),"Needs work");
 data.resume=[]; data.projects=[]; assert.equal(careerReadiness(data).total,0);
});
test("application references survive resume deletion; dates and duplicate task keys are stable", () => {
 const storage=memory(); let data=readCareer(storage,"local"); const apps=data.applications.map(app=>({...app,resumeId:data.resume[0].id}));
 writeCareer(storage,"local","applications",apps,data.applications); writeCareer(storage,"local","resume",[],data.resume);
 data=readCareer(storage,"local"); assert.equal(data.applications[0].resumeId,"resume-0");
 const {applicationDates,careerDate,careerTaskId}=mod.exports;
 assert.equal(applicationDates({...data.applications[0],deadline:"",interviewDate:"2027-01-03T10:00",followUpDate:"2027-01-05"})[0].label,"Interview");
 assert.equal(applicationDates(data.applications[0]).length,0);
 assert.match(careerDate("2027-01-03",new Date("2027-01-01T12:00")),/2/);
 assert.equal(careerTaskId("skills","sql"," Practice SQL "),careerTaskId("skills","sql","practice sql"));
 assert.notEqual(careerTaskId("skills","sql","practice sql"),careerTaskId("skills","sql","practice joins"));
});

test("linked task IDs fit cloud storage for long Unicode practice notes", () => { assert.ok(mod.exports.careerTaskId("skills", "skill-1", "\u0e01".repeat(2000)).length < 200); });

test("internship migration is read-only and idempotent, preserving legacy details and arrangement", () => {
 const storage = memory();
 const legacy = [{...careerDefaults().applications[0], arrangement:"Hybrid", internshipPeriod:"November 2026", resumeId:"resume-0", nextAction:"Prepare resume", nextActionDate:"2026-10-10"}];
 for (const key of ["field", "workType", "duration", "periodMatch", "applicationOpen", "contact", "interestLevel"]) delete legacy[0][key];
 const raw = JSON.stringify(legacy); storage.setItem(careerKey("legacy", "applications"), raw);
 const data = readCareer(storage, "legacy"); const app = data.applications[0];
 for (const key of ["field", "duration", "periodMatch", "applicationOpen", "contact", "interestLevel"]) assert.equal(app[key], "");
 assert.equal(app.workType, "Hybrid"); assert.equal(app.arrangement, "Hybrid");
 assert.equal(app.internshipPeriod, "November 2026"); assert.equal(app.resumeId, "resume-0");
 assert.equal(storage.getItem(careerKey("legacy", "applications")), raw);
 assert.equal(JSON.stringify(mod.exports.migrateSection("applications", data.applications)), JSON.stringify(data.applications));
 assert.equal(mod.exports.careerTaskId("applications", app.id, app.nextAction), mod.exports.careerTaskId("applications", legacy[0].id, legacy[0].nextAction));
});

test("multiple internship positions and Online Test round trip without crossing account scopes", () => {
 const storage = memory(); const data = readCareer(storage, "one");
 const first = {...data.applications[0], id:"backend", company:"Same company", position:"Backend", status:"Online Test", field:"Software", workType:"Remote", duration:"3 months", internshipPeriod:"Apr–Jun 2027", periodMatch:"Match", applicationOpen:"Open", contact:"jobs@example.com", interestLevel:"High"};
 const second = {...first, id:"security", position:"Security", field:"Cybersecurity", workType:"On-site", interestLevel:"Medium"};
 writeCareer(storage, "one", "applications", [first, second], data.applications);
 const reloaded = readCareer(storage, "one");
 assert.equal(JSON.stringify(reloaded.applications), JSON.stringify([first, second]));
 assert.equal(careerReadiness(reloaded).applications, 2);
 assert.equal(readCareer(storage, "two").applications.length, 1);
 for (const change of [{interestLevel:2}, {periodMatch:"invalid"}, {applicationOpen:true}, {workType:"invalid"}, {status:"invalid"}]) {
   assert.throws(() => writeCareer(storage, "one", "applications", [{...first, ...change}, second], reloaded.applications));
   assert.equal(JSON.stringify(readCareer(storage, "one").applications), JSON.stringify(reloaded.applications));
 }
});

test("internship summary and urgency share career calendar-day boundaries", () => {
 const {applicationSummary, applicationUrgency, careerDays} = mod.exports;
 const base = careerDefaults().applications[0];
 const apps = ["Interested", "Preparing", "Applied", "Online Test", "Interview", "Offer", "Rejected"].map((status,i) => ({...base,id:String(i),status}));
 apps.push({...base,id:"open",status:"Interested",applicationOpen:"Open"});
 assert.equal(JSON.stringify(applicationSummary(apps).map(item => item.count)), JSON.stringify([2,2,1,1,1,1]));
 const now = new Date("2026-10-02T23:59:00");
 assert.equal(applicationUrgency("Deadline","2026-10-07",now), "Deadline in 5 days");
 assert.equal(applicationUrgency("Interview","2026-10-03T09:00",now), "Interview tomorrow");
 assert.equal(applicationUrgency("Follow-up","2026-10-02",now), "Follow-up today");
 assert.equal(applicationUrgency("Deadline","2026-10-01",now), "Deadline overdue by 1 day");
 assert.equal(careerDays("2027-01-01",new Date("2026-12-31T12:00")), 1);
 assert.equal(applicationUrgency("Deadline","invalid",now), "");
});
