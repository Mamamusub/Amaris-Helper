import { readEntries, totals, validDate, type Entry } from "./finance";
import { validScenario, validMonthClose, type Scenario, type MonthClose } from "./finance-review";

export const financeTabs = ["Overview", "Transactions", "Budget", "Analytics", "Cash Flow", "Goals", "Net Worth", "Recurring", "Simulator", "Monthly Review"] as const;
export const accountTypes = ["Cash", "Bank", "Investment", "Crypto", "Other Asset", "Debt"] as const;
export type Budget = { id: string; month: string; category: string; amount: number };
export type SavingGoal = { id: string; name: string; target: number; current: number; targetDate: string; contribution: number; notes: string };
export type FinanceAccount = { id: string; name: string; type: typeof accountTypes[number]; value: number };
export type NetWorthSnapshot = { id: string; month: string; assets: number; liabilities: number; updatedAt: string };
export type Recurring = { id: string; name: string; amount: number; category: string; type: Entry["type"]; frequency: "weekly" | "monthly" | "yearly"; startDate: string; endDate: string; nextDate: string; paused: boolean };
export type FinancePlan = { version: 1; openingBalance: number; budgets: Budget[]; goals: SavingGoal[]; accounts: FinanceAccount[]; snapshots: NetWorthSnapshot[]; recurring: Recurring[]; scenarios:Scenario[]; closes:MonthClose[] };
export const financePlanDefaults = (): FinancePlan => ({ version: 1, openingBalance: 0, budgets: [], goals: [], accounts: [], snapshots: [], recurring: [], scenarios:[], closes:[] });
const amount = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const text = (v: unknown, max = 500) => typeof v === "string" && v.length <= max;
const name = (v: unknown) => text(v, 120) && !!(v as string).trim();
export const validMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && v >= "1900-01" && v <= "9999-12";
const optionalDate = (v: string) => v === "" || validDate(v);
export function validateFinancePlan(value: unknown): value is FinancePlan {
 if (!value || typeof value !== "object") return false;
 const p = value as FinancePlan;
 if (p.version !== 1 || !Number.isSafeInteger(p.openingBalance)) return false;
 for (const key of ["budgets", "goals", "accounts", "snapshots", "recurring", "scenarios", "closes"] as const) {
  if (!Array.isArray(p[key]) || !p[key].every(item => item && name(item.id)) || new Set(p[key].map(item => item.id)).size !== p[key].length) return false;
 }
 return p.scenarios.every(validScenario) && p.closes.every(validMonthClose) && p.budgets.every(b => validMonth(b.month) && name(b.category) && amount(b.amount) && b.amount > 0) &&
 new Set(p.budgets.map(b => `${b.month}:${b.category}`)).size === p.budgets.length &&
 p.goals.every(g => name(g.name) && amount(g.target) && g.target > 0 && amount(g.current) && optionalDate(g.targetDate) && amount(g.contribution) && text(g.notes, 2000)) &&
 p.accounts.every(a => name(a.name) && accountTypes.includes(a.type) && amount(a.value)) &&
 p.snapshots.every(s => validMonth(s.month) && amount(s.assets) && amount(s.liabilities) && text(s.updatedAt)) && new Set(p.snapshots.map(s => s.month)).size === p.snapshots.length &&
 p.recurring.every(r => name(r.name) && amount(r.amount) && r.amount > 0 && name(r.category) && ["income", "expense"].includes(r.type) && ["weekly", "monthly", "yearly"].includes(r.frequency) && validDate(r.startDate) && optionalDate(r.endDate) && validDate(r.nextDate) && r.nextDate >= r.startDate && (!r.endDate || r.endDate >= r.startDate) && typeof r.paused === "boolean");
}
export function readFinancePlan(storage: Pick<Storage, "getItem">, key: string): FinancePlan {
 const raw = storage.getItem(key);
 if (raw === null) return financePlanDefaults();
 const parsed = JSON.parse(raw);
 if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid Finance planning document. Existing data has been kept.");
 // Additive defaults; old transaction arrays remain in their original document.
 const value = { ...financePlanDefaults(), ...parsed };
 if (!validateFinancePlan(value)) throw new Error("Finance planning data could not be read. Existing data has been kept.");
 return value;
}
export function writeFinancePlan(storage: Pick<Storage, "getItem" | "setItem">, key: string, next: FinancePlan, expected: FinancePlan) {
 if (!validateFinancePlan(next)) throw new Error("Check names, amounts, dates and duplicate monthly budgets.");
 if (JSON.stringify(readFinancePlan(storage, key)) !== JSON.stringify(expected)) throw new Error("Finance planning data changed elsewhere. Reload before saving.");
 if (expected.closes.some(close => JSON.stringify(next.closes.find(item=>item.id===close.id)) !== JSON.stringify(close))) throw new Error("Closed reports are immutable. Add an explicitly confirmed replacement revision.");
 storage.setItem(key, JSON.stringify(next));
}
export function shiftFinanceDay(value: string, days: number) {
 const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
 return date.toISOString().slice(0, 10);
}
export function shiftFinanceMonth(month: string, offset: number) {
 const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset);
 return date.toISOString().slice(0, 7);
}
export function monthProgress(month: string, today: string) {
 const days = new Date(`${month}-01T12:00:00Z`); days.setUTCMonth(days.getUTCMonth() + 1, 0);
 const count = days.getUTCDate();
 const elapsed = month < today.slice(0, 7) ? count : month > today.slice(0, 7) ? 0 : Number(today.slice(8));
 return { days: count, elapsed, remaining: count - elapsed, fraction: elapsed / count };
}
export function monthlySummary(entries: Entry[], month: string, today: string, openingBalance = 0, reserve = 0) {
 const progress = monthProgress(month, today);
 const cutoff = month < today.slice(0, 7) ? `${month}-${progress.days}` : month > today.slice(0, 7) ? `${month}-01` : today;
 const recorded = entries.filter(e => e.date.startsWith(month));
 const realized = recorded.filter(e => e.date <= today && e.date <= cutoff);
 const summary = totals(realized);
 const balance = openingBalance + totals(entries.filter(e => e.date <= today && e.date <= cutoff)).balance;
 const averageDaily = progress.elapsed ? Math.round(summary.expense / progress.elapsed) : 0;
 const remainingMoney = balance - reserve;
 const previous = totals(entries.filter(e => e.date.startsWith(shiftFinanceMonth(month, -1))));
 const upcoming = totals(recorded.filter(e => e.date > today));
 return { ...summary, ...progress, cashBalance: balance, savings: Math.max(0, summary.balance), remainingMoney, averageDaily,
  safeToSpend: progress.remaining ? Math.floor(Math.max(0, remainingMoney - upcoming.expense) / progress.remaining) : 0,
  projectedBalance: balance + upcoming.income - Math.max(upcoming.expense, averageDaily * progress.remaining),
  previous, incomeChange: summary.income - previous.income, expenseChange: summary.expense - previous.expense };
}
export function budgetSummary(budget: Budget, entries: Entry[], today: string) {
 const spent = totals(entries.filter(e => e.type === "expense" && e.category === budget.category && e.date.startsWith(budget.month) && e.date <= today)).expense;
 const progress = monthProgress(budget.month, today);
 const used = spent / budget.amount;
 return { spent, remaining: budget.amount - spent, percent: used * 100, faster: progress.elapsed > 0 && progress.remaining > 0 && used > progress.fraction, exceeded: spent > budget.amount };
}
export function goalSummary(goal: SavingGoal, today: string) {
 const remaining = Math.max(0, goal.target - goal.current);
 const months = goal.contribution ? Math.ceil(remaining / goal.contribution) : null;
 const completionDate = remaining === 0 ? today : months === null || months > (9999 - Number(today.slice(0,4))) * 12 ? null : shiftFinanceMonth(today.slice(0, 7), months) + "-01";
 return { remaining, percent: Math.min(100, goal.current / goal.target * 100), months, completionDate };
}
export function netWorth(accounts: FinanceAccount[]) {
 const assets = accounts.filter(a => a.type !== "Debt").reduce((sum, a) => sum + a.value, 0);
 const liabilities = accounts.filter(a => a.type === "Debt").reduce((sum, a) => sum + a.value, 0);
 return { assets, liabilities, total: assets - liabilities };
}
// Calculate each date from its anchor, preserving Jan 31 and leap-day schedules.
export function recurringDate(item: Recurring, index: number) {
 if (item.frequency === "weekly") return shiftFinanceDay(item.startDate, index * 7);
 const anchor = new Date(`${item.startDate}T12:00:00Z`);
 const target = new Date(`${item.startDate.slice(0, 7)}-01T12:00:00Z`);
 target.setUTCMonth(target.getUTCMonth() + index * (item.frequency === "yearly" ? 12 : 1));
 const last = new Date(target); last.setUTCMonth(last.getUTCMonth() + 1, 0);
 target.setUTCDate(Math.min(anchor.getUTCDate(), last.getUTCDate()));
 return target.toISOString().slice(0, 10);
}
export function recurringOccurrences(item: Recurring, from: string, to: string) {
 if (item.paused || from > to) return [];
 const dates: string[] = [];
 const start = from > item.nextDate ? from : item.nextDate;
 const end = item.endDate && item.endDate < to ? item.endDate : to;
 // Bound schedule work by the actual date range rather than iterating from 1900.
 const anchor = new Date(`${item.startDate}T12:00:00Z`), first = new Date(`${start}T12:00:00Z`);
 let index = item.frequency === "weekly" ? Math.max(0, Math.floor((first.getTime() - anchor.getTime()) / 604800000) - 1) : Math.max(0, Math.floor(((first.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + first.getUTCMonth() - anchor.getUTCMonth()) / (item.frequency === "yearly" ? 12 : 1)) - 1);
 while (true) { const date = recurringDate(item, index++); if (date > end) break; if (date >= start) dates.push(date); }
 return dates;
}
export const recurringEntryId = (id: string, date: string) => `finance-recurring:${id}:${date}`;
export function recordRecurring(plan: FinancePlan, entries: Entry[], through: string, timestamp: string) {
 const ids = new Set(entries.map(e => e.id)); const added: Entry[] = [];
 const recurring = plan.recurring.map(item => {
  const dates = recurringOccurrences(item, item.nextDate, through);
  for (const date of dates) { const id = recurringEntryId(item.id, date); if (!ids.has(id)) { added.push({id, title:item.name, type:item.type, amount:item.amount, category:item.category, date, note:"Recurring payment", updatedAt:timestamp}); ids.add(id); } }
  if (!dates.length) return item;
  const next = recurringOccurrences({...item, nextDate:shiftFinanceDay(dates.at(-1)!,1), endDate:""}, shiftFinanceDay(dates.at(-1)!,1), shiftFinanceDay(dates.at(-1)!,370))[0];
  return {...item, nextDate:next ?? item.nextDate};
 });
 return { entries:[...entries,...added], plan:{...plan,recurring}, added:added.length };
}
export function cashFlow(entries: Entry[], plan: FinancePlan, today: string) {
 const end = shiftFinanceDay(today, 30);
 const ids = new Set(entries.map(e => e.id));
 const scheduled = plan.recurring.flatMap(item => recurringOccurrences(item, shiftFinanceDay(today,1), end).filter(date => !ids.has(recurringEntryId(item.id,date))).map(date => ({date,type:item.type,amount:item.amount})));
 const upcoming = [...entries.filter(e => e.date > today && e.date <= end), ...scheduled];
 let balance = plan.openingBalance + totals(entries.filter(e => e.date <= today)).balance;
 const initial = balance;
 const points = Array.from({length:30},(_,i) => { const date = shiftFinanceDay(today,i+1); const day = totals(upcoming.filter(e => e.date === date) as Entry[]); balance += day.balance; return {date,balance,income:day.income,expense:day.expense}; });
 return { initial, points, seven:totals(upcoming.filter(e => e.date <= shiftFinanceDay(today,7)) as Entry[]), thirty:totals(upcoming as Entry[]) };
}
export function spendingSeries(entries: Entry[], month: string, months: number) {
 return Array.from({length:months},(_,i) => {const label = shiftFinanceMonth(month, i-months+1); return {label,...totals(entries.filter(e => e.date.startsWith(label)))};});
}
export function spendingTrend(entries: Entry[], month: string, weekly = false) {
 const days = monthProgress(month, `${month}-01`).days;
 const result = Array.from({length:weekly ? Math.ceil(days/7) : days},(_,i) => ({label:weekly ? `Days ${i*7+1}–${Math.min(days,i*7+7)}` : `${month}-${String(i+1).padStart(2,"0")}`, amount:0}));
 entries.filter(e=>e.type === "expense" && e.date.startsWith(month)).forEach(e => {const day=Number(e.date.slice(8))-1;result[weekly ? Math.floor(day/7):day].amount+=e.amount;});
 return result;
}
export function weekdaySpending(entries: Entry[], month: string, today: string) {
 const result = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(label=>({label,amount:0,days:0,average:0}));
 for (let i=1;i<=monthProgress(month,today).days;i++) { const date=`${month}-${String(i).padStart(2,"0")}`; if (date>today) continue; const row=result[new Date(`${date}T12:00:00Z`).getUTCDay()]; row.days++; row.amount+=totals(entries.filter(e=>e.date===date)).expense; }
 return result.map(row=>({...row,average:row.days ? Math.round(row.amount/row.days):0}));
}
// Verify both documents before coordinating recurring payments through the existing adapter.
export function recurringBaseline(storage: Pick<Storage,"getItem">, ledgerKey: string, planKey: string, entries: Entry[], plan: FinancePlan) {
 if (JSON.stringify(readEntries(storage,ledgerKey)) !== JSON.stringify(entries) || JSON.stringify(readFinancePlan(storage,planKey)) !== JSON.stringify(plan)) throw new Error("Finance data changed elsewhere. Reload before recording recurring payments.");
}
