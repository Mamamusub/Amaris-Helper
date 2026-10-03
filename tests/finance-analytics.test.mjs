import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const cache = new Map();
function load(file) {
 if (cache.has(file)) return cache.get(file);
 const mod = {exports:{}};
 const require = name => load(path.join(path.dirname(file),name)+".ts");
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require,Date,Intl});
 cache.set(file,mod.exports); return mod.exports;
}
const f=load("src/lib/finance-analytics.ts"), legacy=load("src/lib/finance.ts");
const entry=(id,date,type,amount,category="Food")=>({id,date,type,amount,category,title:id,note:"Original note",updatedAt:"old"});
const recurring=(patch={})=>({id:"rent",name:"Rent",amount:10000,category:"Housing",type:"expense",frequency:"monthly",startDate:"2026-01-31",endDate:"",nextDate:"2026-01-31",paused:false,...patch});
const plain=value=>JSON.parse(JSON.stringify(value));
function memory(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}

test("monthly summaries use realized satang, prior month trends, reserves, safe spending and month-end pace",()=>{
 const entries=[entry("old-in","2026-09-01","income",80000),entry("old-out","2026-09-05","expense",20000),entry("salary","2026-10-01","income",100000),entry("food","2026-10-05","expense",10000),entry("planned","2026-10-20","expense",5000),entry("expected","2026-10-20","income",20000)];
 const s=f.monthlySummary(entries,"2026-10","2026-10-10",50000,20000);
 assert.equal(s.income,100000);assert.equal(s.expense,10000);assert.equal(s.balance,90000);assert.equal(s.cashBalance,200000);assert.equal(s.savings,90000);assert.equal(s.remainingMoney,180000);assert.equal(s.averageDaily,1000);assert.equal(s.safeToSpend,8333);assert.equal(s.projectedBalance,199000);
 assert.equal(s.incomeChange,20000);assert.equal(s.expenseChange,-10000);assert.equal(s.remaining,21);
 const end=f.monthlySummary(entries,"2026-09","2026-10-10");assert.equal(end.elapsed,30);assert.equal(end.remaining,0);assert.equal(end.safeToSpend,0);
 const deficit=f.monthlySummary([entry("expense","2026-10-01","expense",5000)],"2026-10","2026-10-10");assert.equal(deficit.savings,0);assert.equal(deficit.safeToSpend,0);assert.ok(deficit.projectedBalance<0);
 assert.equal(f.monthlySummary([],"2026-11","2026-10-10").averageDaily,0);
 assert.equal(f.monthProgress("2028-02","2028-02-29").days,29);
});
test("monthly budgets preserve scope and identify excessive pace and overspending",()=>{
 const budget={id:"food",month:"2026-10",category:"Food",amount:10000};
 const entries=[entry("one","2026-10-02","expense",5000),entry("future","2026-10-30","expense",9000),entry("other-month","2026-09-02","expense",6000),entry("other-category","2026-10-02","expense",5000,"Travel")];
 const s=f.budgetSummary(budget,entries,"2026-10-10");assert.equal(s.spent,5000);assert.equal(s.remaining,5000);assert.equal(s.percent,50);assert.equal(s.faster,true);assert.equal(s.exceeded,false);
 const completed=f.budgetSummary(budget,entries,"2026-11-01");assert.equal(completed.remaining,-4000);assert.equal(completed.exceeded,true);assert.equal(completed.faster,false);
});
test("saving goals handle completed, unfunded, fractional and zero-contribution estimates",()=>{
 const goal={id:"one",name:"Emergency fund",target:100001,current:30000,contribution:20000,targetDate:"",notes:""};
 assert.deepEqual(plain(f.goalSummary(goal,"2026-10-03")),{remaining:70001,percent:30000/100001*100,months:4,completionDate:"2027-02-01"});
 assert.equal(f.goalSummary({...goal,contribution:0},"2026-10-03").completionDate,null);
 assert.equal(f.goalSummary({...goal,current:150000},"2026-10-03").percent,100);
 assert.equal(f.goalSummary({...goal,current:150000},"2026-10-03").completionDate,"2026-10-03");
});
test("net worth treats debt as liabilities and keeps snapshot history independent of account edits",()=>{
 const accounts=[{id:"cash",name:"Wallet",type:"Cash",value:10000},{id:"bank",name:"Bank",type:"Bank",value:50000},{id:"debt",name:"Loan",type:"Debt",value:20000}];
 assert.deepEqual(plain(f.netWorth(accounts)),{assets:60000,liabilities:20000,total:40000});assert.equal(f.netWorth([]).total,0);
 const plan=f.financePlanDefaults();plan.accounts=accounts;plan.snapshots=[{id:"snap",month:"2026-10",assets:60000,liabilities:20000,updatedAt:"now"}];plan.accounts[0].value=0;assert.equal(plan.snapshots[0].assets,60000);
});
test("recurring dates clamp month ends from the anchor and preserve yearly leap dates",()=>{
 const item=recurring();assert.deepEqual(plain(f.recurringOccurrences(item,"2026-01-01","2026-04-30")),["2026-01-31","2026-02-28","2026-03-31","2026-04-30"]);
 assert.deepEqual(plain(f.recurringOccurrences(recurring({startDate:"2024-02-29",nextDate:"2024-02-29",frequency:"yearly"}),"2025-01-01","2028-12-31")),["2025-02-28","2026-02-28","2027-02-28","2028-02-29"]);
 assert.deepEqual(plain(f.recurringOccurrences(recurring({frequency:"weekly",startDate:"2026-12-28",nextDate:"2026-12-28",endDate:"2027-01-04"}),"2026-12-01","2027-02-01")),["2026-12-28","2027-01-04"]);
 assert.equal(f.recurringOccurrences({...item,paused:true},"2026-01-01","2026-12-31").length,0);
});
test("posting recurring occurrences is deterministic, advances dates and never duplicates across retries",()=>{
 const plan=f.financePlanDefaults();plan.recurring=[recurring()];
 const first=f.recordRecurring(plan,[],"2026-03-31","now");assert.equal(first.added,3);assert.equal(first.plan.recurring[0].nextDate,"2026-04-30");
 const second=f.recordRecurring(first.plan,first.entries,"2026-03-31","later");assert.equal(second.added,0);assert.equal(second.entries.length,3);
 const replay=f.recordRecurring(plan,first.entries,"2026-03-31","later");assert.equal(replay.added,0);assert.equal(replay.plan.recurring[0].nextDate,"2026-04-30");
 const afterDelete=f.recordRecurring(first.plan,first.entries.slice(1),"2026-03-31","later");assert.equal(afterDelete.added,0);
 assert.equal(f.recordRecurring({...plan,recurring:[recurring({paused:true})]},[],"2026-03-31","now").added,0);
});
test("30-day forecast combines future ledger and recurring items once and respects 7/30-day boundaries",()=>{
 const today="2026-10-03",plan=f.financePlanDefaults();plan.openingBalance=10000;
 plan.recurring=[recurring({id:"weekly",amount:500,startDate:"2026-10-04",nextDate:"2026-10-04",frequency:"weekly"}),recurring({id:"salary",amount:10000,type:"income",startDate:"2026-10-10",nextDate:"2026-10-10"}),recurring({id:"paused",paused:true})];
 const entries=[entry("old","2026-10-01","income",5000),entry(f.recurringEntryId("weekly","2026-10-04"),"2026-10-04","expense",500),entry("future","2026-10-10","expense",2000),entry("outside","2026-11-04","expense",99999)];
 const flow=f.cashFlow(entries,plan,today);assert.equal(flow.initial,15000);assert.equal(flow.points.length,30);assert.equal(flow.points[0].balance,14500);assert.equal(flow.seven.income,10000);assert.equal(flow.seven.expense,2500);assert.equal(flow.thirty.expense,4500);assert.equal(flow.points.at(-1).balance,20500);
});
test("analytics keeps daily/weekly totals aligned, includes empty history and weekday denominators",()=>{
 const entries=[entry("one","2026-10-01","expense",101),entry("two","2026-10-08","expense",202)];
 assert.equal(f.spendingTrend(entries,"2026-10").length,31);assert.equal(f.spendingTrend(entries,"2026-10",true).reduce((sum,r)=>sum+r.amount,0),303);
 const series=f.spendingSeries(entries,"2026-10",12);assert.equal(series.length,12);assert.equal(series.at(-1).expense,303);assert.equal(series[0].expense,0);
 const weekday=f.weekdaySpending(entries,"2026-10","2026-10-08");assert.equal(weekday.find(r=>r.label==="Thu").average,152);
});
test("planning migration is read-only and leaves existing ledger, categories and month preferences unchanged",()=>{
 const storage=memory(),key="account.finance.v1",entryData=[entry("legacy","2026-01-01","expense",99)];
 storage.setItem(key,JSON.stringify(entryData));storage.setItem(key+".categories",JSON.stringify({income:["Salary"],expense:["Food"]}));storage.setItem(key+".month","2026-01");const before=[...storage.values];
 const plan=f.readFinancePlan(storage,key+".analytics");assert.deepEqual(plain(plan),plain(f.financePlanDefaults()));assert.deepEqual([...storage.values],before);assert.equal(legacy.readEntries(storage,key)[0].note,"Original note");
 f.writeFinancePlan(storage,key+".analytics",{...plan,budgets:[{id:"b",month:"2026-10",category:"Food",amount:100}]},plan);assert.equal(storage.getItem(key),before[0][1]);
 assert.throws(()=>f.writeFinancePlan(storage,key+".analytics",plan,plan));assert.equal(f.readFinancePlan(storage,"other.finance.v1.analytics").budgets.length,0);
 for(const raw of ["broken","null","[]",JSON.stringify({...plan,goals:[{id:"bad"}]}),JSON.stringify({...plan,openingBalance:1.5})]){storage.setItem("bad",raw);assert.throws(()=>f.readFinancePlan(storage,"bad"));assert.equal(storage.getItem("bad"),raw);}
 const bad={...plan,budgets:[{id:"one",month:"2026-10",category:"Food",amount:100},{id:"two",month:"2026-10",category:"Food",amount:200}]};assert.equal(f.validateFinancePlan(bad),false);
 assert.throws(()=>f.writeFinancePlan({getItem:()=>null,setItem:()=>{throw Error("Quota");}},"failed",plan,plan));
});
