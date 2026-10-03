import { totals, type Entry } from "./finance";
import { dayKey } from "./calendar";
import type { FinancePlan } from "./finance-analytics";

export const simulationYears = [1, 5, 10, 20, 30] as const;
export type Scenario = { id:string; name:string; startingCash:number; income:number; expenses:number; savings:number; investment:number; annualReturn:number; inflation:number; years:typeof simulationYears[number] };
export function validScenario(s:Scenario) {
 return !!s && typeof s.id === "string" && !!s.id && typeof s.name === "string" && !!s.name.trim() && s.name.length<=120 && [s.startingCash,s.income,s.expenses,s.savings,s.investment].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=99999999999) && Number.isFinite(s.annualReturn)&&s.annualReturn>=-99&&s.annualReturn<=100 && Number.isFinite(s.inflation)&&s.inflation>=0&&s.inflation<=100 && simulationYears.includes(s.years);
}
export function simulateScenario(s:Scenario) {
 if(!validScenario(s))throw Error("Check scenario amounts, rates and period.");
 const monthlyRate=Math.pow(1+s.annualReturn/100,1/12)-1;
 let investment=0, cash=s.startingCash, savings=0;
 const yearly=[];
 for(let month=1;month<=s.years*12;month++) {
  investment=investment*(1+monthlyRate)+s.investment;
  savings+=s.savings;
  cash+=s.income-s.expenses-s.savings-s.investment;
  if(month%12===0){const year=month/12, investmentContributions=s.investment*month, savingsContributions=s.savings*month, wealth=cash+savings+investment;
   yearly.push({year,cash:Math.round(cash),savings:Math.round(savings),investment:Math.round(investment),investmentContributions,savingsContributions,contributions:investmentContributions+savingsContributions,growth:Math.round(investment-investmentContributions),wealth:Math.round(wealth),purchasingPower:Math.round(wealth/Math.pow(1+s.inflation/100,year))});
  }
 }
 return {yearly,final:yearly.at(-1)!,savingsRate:s.income ? s.savings/s.income*100:0,investmentRate:s.income ? s.investment/s.income*100:0,monthlyUnallocated:s.income-s.expenses-s.savings-s.investment};
}
export function compareScenarios(base:Scenario,other:Scenario) {
 const a=simulateScenario(base),b=simulateScenario(other);
 return {wealth:b.final.wealth-a.final.wealth,contributions:b.final.contributions-a.final.contributions,growth:b.final.growth-a.final.growth,savingsRate:b.savingsRate-a.savingsRate,investmentRate:b.investmentRate-a.investmentRate};
}
export type MonthReport = {
 income:number; expenses:number; netCashFlow:number; savings:number; savingsRate:number; investmentContribution:number; goalContributions:number;
 averageDaily:number; biggestExpense:{title:string;category:string;amount:number;date:string}|null;
 categories:{name:string;amount:number}[]; budgets:{category:string;amount:number;spent:number;remaining:number}[];
 recurringPaid:number; goals:{name:string;amount:number}[]; netWorth:number|null; netWorthChange:number|null;
 previous:{month:string;income:number;expenses:number;savings:number;netWorth:number|null}; incomeChange:number; expenseChange:number; savingsChange:number;
};
export type MonthClose = {id:string;month:string;closedAt:string;report:MonthReport};
const previousMonth=(month:string)=>{const d=new Date(`${month}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);};
export function monthlyReview(entries:Entry[],plan:FinancePlan,month:string,asOf?:string):MonthReport {
 const monthly=entries.filter(e=>e.date.startsWith(month)&&(!asOf||e.date<=asOf)), expenses=monthly.filter(e=>e.type==="expense"), total=totals(monthly);
 const invested=expenses.filter(e=>e.purpose==="investment").reduce((n,e)=>n+e.amount,0), goalContributions=expenses.filter(e=>e.purpose==="goal").reduce((n,e)=>n+e.amount,0);
 const savings=Math.max(0,total.balance+invested+goalContributions);
 const prevMonth=previousMonth(month), closed=plan.closes.filter(c=>c.month===prevMonth).at(-1);
 const prevEntries=entries.filter(e=>e.date.startsWith(prevMonth)),prev=totals(prevEntries);
 const previous={month:prevMonth,income:closed?.report.income??prev.income,expenses:closed?.report.expenses??prev.expense,savings:closed?.report.savings??Math.max(0,prev.balance+prevEntries.filter(e=>e.type==="expense"&&(e.purpose==="investment"||e.purpose==="goal")).reduce((n,e)=>n+e.amount,0)),netWorth:closed?.report.netWorth??(plan.snapshots.find(s=>s.month===prevMonth) ? plan.snapshots.find(s=>s.month===prevMonth)!.assets-plan.snapshots.find(s=>s.month===prevMonth)!.liabilities:null)};
 const snapshot=plan.snapshots.find(s=>s.month===month),netWorth=snapshot?snapshot.assets-snapshot.liabilities:null;
 const last=new Date(`${month}-01T12:00:00Z`);last.setUTCMonth(last.getUTCMonth()+1,0);
 const categories=[...new Set(expenses.map(e=>e.category))].map(name=>({name,amount:expenses.filter(e=>e.category===name).reduce((n,e)=>n+e.amount,0)})).sort((a,b)=>b.amount-a.amount);
 const budgets=plan.budgets.filter(b=>b.month===month).map(b=>{const spent=expenses.filter(e=>e.category===b.category).reduce((n,e)=>n+e.amount,0);return {category:b.category,amount:b.amount,spent,remaining:b.amount-spent};});
 const biggest=[...expenses].sort((a,b)=>b.amount-a.amount)[0];
 const goals=[...new Set(expenses.filter(e=>e.purpose==="goal").map(e=>e.goalId||"unassigned"))].map(id=>({name:plan.goals.find(g=>g.id===id)?.name||"Unassigned / removed goal",amount:expenses.filter(e=>e.purpose==="goal"&&(e.goalId||"unassigned")===id).reduce((n,e)=>n+e.amount,0)}));
 const days=asOf&&asOf.startsWith(month)?Math.max(1,Number(asOf.slice(8))):last.getUTCDate();
 return {income:total.income,expenses:total.expense,netCashFlow:total.balance,savings,savingsRate:total.income?savings/total.income*100:0,investmentContribution:invested,goalContributions,averageDaily:Math.round(total.expense/days),biggestExpense:biggest?{title:biggest.title,category:biggest.category,amount:biggest.amount,date:biggest.date}:null,categories,budgets,recurringPaid:expenses.filter(e=>e.id.startsWith("finance-recurring:")).reduce((n,e)=>n+e.amount,0),goals,netWorth,netWorthChange:netWorth!==null&&previous.netWorth!==null?netWorth-previous.netWorth:null,previous,incomeChange:total.income-previous.income,expenseChange:total.expense-previous.expenses,savingsChange:savings-previous.savings};
}
export function closeFinanceMonth(plan:FinancePlan,entries:Entry[],month:string,timestamp:string,replace=false):FinancePlan {
 if (!Number.isFinite(Date.parse(timestamp))) throw Error("Choose a valid close timestamp.");
 const closingDay=dayKey(new Date(timestamp));
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<"1900-01"||month>"9999-12")throw Error("Choose a valid month.");
 if(month>closingDay.slice(0,7))throw Error("Future months cannot be closed.");
 const existing=plan.closes.filter(c=>c.month===month);
 if(existing.length&&!replace)throw Error("This month is already closed. Explicit replacement confirmation is required.");
 const record:MonthClose={id:`close:${month}:${existing.length+1}`,month,closedAt:timestamp,report:monthlyReview(entries,plan,month,closingDay)};
 // Append replacement revisions; older reports are never mutated or discarded.
 return {...plan,closes:[...plan.closes,JSON.parse(JSON.stringify(record))]};
}
export function validMonthClose(c:MonthClose) {
 if(!c||typeof c.id!=="string"||!c.id||typeof c.month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.month)||typeof c.closedAt!=="string"||!Number.isFinite(Date.parse(c.closedAt))||!c.report)return false;
 const r=c.report;const integer=(v:unknown)=>Number.isSafeInteger(v),positive=(v:unknown)=>integer(v)&&(v as number)>=0;
 return [r.income,r.expenses,r.savings,r.investmentContribution,r.goalContributions,r.averageDaily,r.recurringPaid].every(positive)&&integer(r.netCashFlow)&&Number.isFinite(r.savingsRate)&&r.savingsRate>=0&&(r.netWorth===null||integer(r.netWorth))&&(r.netWorthChange===null||integer(r.netWorthChange))&&[r.incomeChange,r.expenseChange,r.savingsChange].every(integer)&&Array.isArray(r.categories)&&r.categories.every(v=>typeof v.name==="string"&&positive(v.amount))&&Array.isArray(r.budgets)&&r.budgets.every(v=>typeof v.category==="string"&&positive(v.amount)&&positive(v.spent)&&integer(v.remaining))&&Array.isArray(r.goals)&&r.goals.every(v=>typeof v.name==="string"&&positive(v.amount))&&!!r.previous&&typeof r.previous.month==="string"&&[r.previous.income,r.previous.expenses,r.previous.savings].every(positive)&&(r.previous.netWorth===null||integer(r.previous.netWorth))&&(r.biggestExpense===null||typeof r.biggestExpense.title==="string"&&typeof r.biggestExpense.category==="string"&&typeof r.biggestExpense.date==="string"&&positive(r.biggestExpense.amount));
}
export function closedMonthSeries(plan:FinancePlan,endMonth:string,count:number) {
 const end=new Date(`${endMonth}-01T12:00:00Z`);
 return Array.from({length:count},(_,i)=>{const date=new Date(end);date.setUTCMonth(date.getUTCMonth()+i-count+1);const month=date.toISOString().slice(0,7);return {month,report:plan.closes.filter(c=>c.month===month).at(-1)?.report??null};});
}
