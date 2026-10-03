import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Date,Intl,require:name=>load(path.join(path.dirname(file),name)+".ts")});cache.set(file,mod.exports);return mod.exports;}
const f=load("src/lib/finance-review.ts"),plans=load("src/lib/finance-analytics.ts"),ledger=load("src/lib/finance.ts");
const scenario=patch=>({id:"current",name:"Current Plan",startingCash:100000,income:50000,expenses:20000,savings:10000,investment:10000,annualReturn:12,inflation:10,years:1,...patch});
const entry=(id,date,type,amount,extra={})=>({id,title:id,date,type,amount,category:"Food",note:"Evidence",updatedAt:"now",...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
test("scenario compounding uses effective monthly rates and end-of-month contributions",()=>{
 const s=scenario(),result=f.simulateScenario(s),rate=Math.pow(1.12,1/12)-1;
 assert.equal(result.final.investment,Math.round(10000*(Math.pow(1+rate,12)-1)/rate));
 assert.equal(result.final.contributions,240000);assert.equal(result.final.investmentContributions,120000);assert.equal(result.final.cash,220000);assert.equal(result.final.savings,120000);
 assert.equal(result.final.wealth,result.final.cash+result.final.savings+result.final.investment);
 assert.equal(result.savingsRate,20);assert.equal(result.investmentRate,20);
 for(const years of [1,5,10,20,30])assert.equal(f.simulateScenario(scenario({years})).yearly.length,years);
});
test("inflation adjusts purchasing power and allocations never create free income",()=>{
 const a=f.simulateScenario(scenario({annualReturn:0}));assert.equal(a.final.investment,120000);assert.equal(a.final.growth,0);assert.equal(a.final.wealth,460000);assert.equal(a.final.purchasingPower,Math.round(460000/1.1));
 const b=f.simulateScenario(scenario({annualReturn:0,savings:0,investment:20000}));assert.equal(a.final.wealth,b.final.wealth);
 const deficit=f.simulateScenario(scenario({startingCash:1000,income:0,expenses:0,savings:100,investment:100,annualReturn:0,inflation:0}));assert.equal(deficit.final.wealth,1000);assert.equal(deficit.final.cash,-1400);
 const negative=f.simulateScenario(scenario({annualReturn:-50}));assert.ok(negative.final.growth<0);assert.ok(negative.final.investment>0);
});
test("scenario comparisons separate wealth, contributions and investment growth",()=>{
 const base=scenario(),higher=scenario({id:"higher",investment:15000,savings:5000});const a=f.simulateScenario(base),b=f.simulateScenario(higher),compare=f.compareScenarios(base,higher);
 assert.equal(compare.wealth,b.final.wealth-a.final.wealth);assert.equal(compare.contributions,0);assert.equal(compare.growth,b.final.growth-a.final.growth);assert.equal(compare.savingsRate,-10);assert.equal(compare.investmentRate,10);
 for(const patch of [{annualReturn:-100},{annualReturn:Infinity},{inflation:-1},{years:2},{income:1.5},{name:""}])assert.throws(()=>f.simulateScenario(scenario(patch)));
});
test("monthly close captures actual tags, budget overruns, recurring payments and comparisons",()=>{
 const plan=plans.financePlanDefaults();plan.budgets=[{id:"food",month:"2026-09",category:"Food",amount:10000}];plan.goals=[{id:"fund",name:"Emergency fund",target:100000,current:2000,contribution:2000,targetDate:"",notes:""}];plan.snapshots=[{id:"aug",month:"2026-08",assets:100000,liabilities:10000,updatedAt:"now"},{id:"sep",month:"2026-09",assets:120000,liabilities:5000,updatedAt:"now"}];
 const entries=[entry("salary","2026-09-01","income",100000),entry("food","2026-09-02","expense",20000),entry("invest","2026-09-03","expense",10000,{purpose:"investment",category:"Investing"}),entry("goal","2026-09-03","expense",5000,{purpose:"goal",goalId:"fund",category:"Savings"}),entry("finance-recurring:rent:2026-09-04","2026-09-04","expense",15000,{category:"Rent"}),entry("old","2026-08-01","income",80000)];
 const closed=f.closeFinanceMonth(plan,entries,"2026-09","2026-10-03T12:00:00Z");const r=closed.closes[0].report;
 assert.equal(r.income,100000);assert.equal(r.expenses,50000);assert.equal(r.netCashFlow,50000);assert.equal(r.savings,65000);assert.equal(r.savingsRate,65);assert.equal(r.investmentContribution,10000);assert.equal(r.goalContributions,5000);assert.equal(r.recurringPaid,15000);assert.equal(r.biggestExpense.title,"food");assert.equal(r.budgets[0].remaining,-10000);assert.equal(r.netWorth,115000);assert.equal(r.netWorthChange,25000);assert.equal(r.incomeChange,20000);assert.equal(r.averageDaily,1667);assert.equal(r.goals[0].name,"Emergency fund");assert.equal(plan.closes.length,0);
 assert.equal(plans.validateFinancePlan(closed),true);assert.equal(ledger.readEntries({getItem:()=>JSON.stringify(entries)},"ledger").length,entries.length);
});
test("duplicate close prevention and confirmed revisions retain immutable history",()=>{
 const plan=plans.financePlanDefaults(),entries=[entry("salary","2026-09-01","income",100000),entry("food","2026-09-02","expense",20000)];
 const closed=f.closeFinanceMonth(plan,entries,"2026-09","2026-10-03T12:00:00Z"),original=JSON.stringify(closed.closes[0]);
 assert.throws(()=>f.closeFinanceMonth(closed,entries,"2026-09","2026-10-04T12:00:00Z"),/already closed/);
 entries[1].title="Edited transaction";entries[1].category="Renamed category";entries[1].amount=50000;
 assert.equal(JSON.stringify(closed.closes[0]),original);
 const revised=f.closeFinanceMonth(closed,entries,"2026-09","2026-10-04T12:00:00Z",true);assert.equal(revised.closes.length,2);assert.equal(JSON.stringify(revised.closes[0]),original);assert.equal(revised.closes[1].report.expenses,50000);
 const storage={getItem:()=>JSON.stringify(closed),setItem(){}};
 assert.throws(()=>plans.writeFinancePlan(storage,"plan",{...closed,closes:[]},closed),/immutable/);
 assert.throws(()=>plans.writeFinancePlan(storage,"plan",{...closed,closes:[{...closed.closes[0],report:{...closed.closes[0].report,income:1}}]},closed),/immutable/);
 assert.doesNotThrow(()=>plans.writeFinancePlan(storage,"plan",revised,closed));
});
test("previous-month comparisons and chart series prefer frozen closes over later edited ledger data",()=>{
 const plan=plans.financePlanDefaults();const entries=[entry("old","2026-08-01","income",80000),entry("new","2026-09-01","income",100000)];
 const closed=f.closeFinanceMonth(plan,entries,"2026-08","2026-09-01T12:00:00Z");entries[0].amount=200000;
 assert.equal(f.monthlyReview(entries,closed,"2026-09").incomeChange,20000);
 const series=f.closedMonthSeries(closed,"2026-09",3);assert.equal(series.length,3);assert.equal(series[0].report,null);assert.equal(series[1].report.income,80000);assert.equal(series[2].report,null);
});
test("additive planning migration is read-only and partial-month closes exclude scheduled future records",()=>{
 const legacy=plans.financePlanDefaults();delete legacy.scenarios;delete legacy.closes;
 const raw=JSON.stringify(legacy),storage={getItem:()=>raw,setItem(){throw Error("Must not write during read");}};
 const migrated=plans.readFinancePlan(storage,"plan");assert.deepEqual(plain(migrated.scenarios),[]);assert.deepEqual(plain(migrated.closes),[]);assert.equal(JSON.stringify(legacy),raw);
 const entries=[entry("now","2026-10-01","income",10000),entry("later","2026-10-20","expense",9999)];
 const closed=f.closeFinanceMonth(migrated,entries,"2026-10","2026-10-03T12:00:00Z");assert.equal(closed.closes[0].report.expenses,0);
 assert.throws(()=>f.closeFinanceMonth(migrated,entries,"2026-11","2026-10-03T12:00:00Z"),/Future/);
 assert.equal(f.monthlyReview([],migrated,"2026-09").savingsRate,0);
 const boundary=f.closeFinanceMonth(migrated,[entry("bangkok","2026-10-01","income",123)],"2026-10","2026-09-30T18:00:00Z");assert.equal(boundary.closes[0].report.income,123);
});
