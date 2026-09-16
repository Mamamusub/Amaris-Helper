import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/build-lab-storage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,crypto:webcrypto});
const {newProject,readProjects,writeProjects,progress,readiness,selectProjects,safeProjectUrl,buildLabKey}=mod.exports;
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
test('project CRUD, nested tasks, logs, resources and milestones survive reload',()=>{
 const s=memory();let all=readProjects(s);assert.equal(all.length,0);
 const p=newProject('one');p.name='ESP32 Monitor';p.type='Hardware / IoT';writeProjects(s,[p],all);all=readProjects(s);
 const edited={...all[0],name:'Patient Monitor',tasks:[{id:'task',projectId:'one',title:'Testing',category:'MVP',priority:'High',dueDate:'2026-10-01',completed:false,order:0}],logs:[{id:'log',projectId:'one',title:'Prototype works',content:'Sensor tested',tags:['hardware'],createdAt:'2026-09-16T10:00:00Z'}],resources:[{id:'resource',projectId:'one',name:'Docs',type:'Documentation',url:'https://example.com/docs'}],milestones:[{id:'milestone',projectId:'one',title:'MVP',targetDate:'2026-10-01',completed:false,notes:'First demo'}]};
 writeProjects(s,[edited],all);all=readProjects(s);assert.equal(all[0].name,'Patient Monitor');assert.equal(all[0].logs[0].content,'Sensor tested');assert.equal(all[0].resources[0].name,'Docs');assert.equal(progress(all[0]),0);
 writeProjects(s,[{...all[0],tasks:[{...all[0].tasks[0],completed:true}]}],all);all=readProjects(s);assert.equal(progress(all[0]),100);
 writeProjects(s,[{...all[0],tasks:[]}],all);all=readProjects(s);assert.equal(progress(all[0]),0);
 writeProjects(s,[],all);assert.equal(readProjects(s).length,0);
});
test('legacy draft is preserved, migration repeatable and deletion does not revive it',()=>{
 const s=memory();const raw=JSON.stringify({name:'Existing project',brief:'Existing brief',stack:'React + CSS',notes:'Keep these notes',done:[0,2,2,99]});s.setItem(buildLabKey,raw);
 const all=readProjects(s);assert.equal(all[0].description,'Keep these notes');assert.equal(progress(all[0]),40);assert.equal(s.getItem(buildLabKey),raw);
 assert.equal(JSON.stringify(readProjects(s)),JSON.stringify(all));writeProjects(s,all,all);assert.equal(s.getItem(`${buildLabKey}.legacy-backup`),raw);
 writeProjects(s,[],readProjects(s));assert.equal(readProjects(s).length,0);assert.equal(s.getItem(`${buildLabKey}.legacy-backup`),raw);
});
test('search, combined filters, sorting, manual progress and deterministic readiness',()=>{
 const a=newProject('a');a.name='Monitor';a.type='Hardware / IoT';a.status='Completed';a.technologies=['ESP32'];a.shortDescription='Patient monitor';a.repositoryUrl='https://github.com/example/monitor';a.documentationUrl='https://example.com/docs';a.portfolio.result='Sent sensor alerts';a.autoProgress=false;a.manualProgress=75;
 const b=newProject('b');b.name='Pairing';b.tags=['Go'];b.status='In Progress';b.type='Web';
 assert.equal(selectProjects([a,b],'esp32','Completed','Hardware / IoT','ESP32','Progress').length,1);assert.equal(selectProjects([a,b],'go','','','','Project Name')[0].id,'b');assert.equal(selectProjects([a,b],'','On Hold','','','Progress').length,0);
 assert.equal(progress(a),75);assert.equal(readiness(a).filter(([,ok])=>ok).length,6);assert.equal(readiness(b).filter(([,ok])=>ok).length,0);
 a.manualProgress=200;assert.equal(progress(a),100);for(const url of ['javascript:alert(1)','data:text/html,test','/path','bad'])assert.equal(safeProjectUrl(url),null);
});
test('stale edits, malformed data, and failed writes preserve stored data',()=>{
 const s=memory(),p=newProject('one');p.name='Original';writeProjects(s,[p],[]);const stale=readProjects(s);writeProjects(s,[{...p,name:'Changed elsewhere'}],stale);
 assert.throws(()=>writeProjects(s,[],stale),/changed elsewhere/);assert.equal(readProjects(s)[0].name,'Changed elsewhere');
 s.setItem(buildLabKey,'broken');assert.throws(()=>readProjects(s));assert.throws(()=>writeProjects(s,[],[]));assert.equal(s.getItem(buildLabKey),'broken');
 const failed={getItem:()=>null,setItem:()=>{throw Error('quota');}};assert.throws(()=>writeProjects(failed,[p],[]),/quota/);
});
