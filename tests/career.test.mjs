import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/career-storage.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, URL });
const { careerDefaults, careerReadiness, readCareer, writeCareer, careerKey, safeCareerUrl, projectStatus } = mod.exports;
function memory() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
test("readiness is deterministic, zero initially and 100 when all four groups are complete", () => {
  const data = careerDefaults(); assert.equal(careerReadiness(data).total, 0);
  data.resume.forEach((item) => item.checks.fill(true));
  assert.equal(careerReadiness(data).total, 25);
  data.projects.forEach((item) => item.checks.fill(true));
  data.skills.forEach((item) => item.level = "Comfortable");
  data.applications.forEach((item) => item.status = "Rejected");
  assert.equal(careerReadiness(data).total, 100); assert.equal(careerReadiness(data).readyProjects, 4);
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
  assert.equal(readCareer(storage, "account-two").applications.length, 3);
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
