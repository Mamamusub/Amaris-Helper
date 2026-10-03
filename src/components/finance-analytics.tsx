import { useEffect, useRef, useState, type FormEvent } from "react";
import { money, parseAmount, type Entry, type CategoryMap } from "@/lib/finance";
import { dayKey } from "@/lib/calendar";
import { documentId } from "@/lib/account-storage";
import { accountTypes, budgetSummary, cashFlow, financePlanDefaults, goalSummary, monthlySummary, netWorth, readFinancePlan, recordRecurring, recurringBaseline, recurringOccurrences, shiftFinanceDay, spendingSeries, spendingTrend, weekdaySpending, writeFinancePlan, type FinancePlan, type financeTabs } from "@/lib/finance-analytics";
import { useAccountStorage, useCloud } from "./account-boundary";
import { dialogKeyboard } from "./dialog-keyboard";
import ExpenseChart from "./expense-chart";
import styles from "./finance-view.module.css";

type Tab = typeof financeTabs[number];
type Section = "budgets" | "goals" | "accounts" | "recurring" | "settings";
type Editor = { section: Section; id?: string; values: Record<string,string>; baseline: string };
type Field = { key: string; label: string; type?: string; options?: readonly string[]; required?: boolean };
const titles: Record<Section,string> = {budgets:"budget",goals:"saving goal",accounts:"account",recurring:"recurring item",settings:"opening balance"};
const fields: Record<Section,Field[]> = {
 budgets:[{key:"category",label:"Expense category",required:true},{key:"amount",label:"Budget amount",required:true}],
 goals:[{key:"name",label:"Goal name",required:true},{key:"target",label:"Target amount",required:true},{key:"current",label:"Current amount",required:true},{key:"targetDate",label:"Target date",type:"date"},{key:"contribution",label:"Monthly contribution",required:true},{key:"notes",label:"Notes"}],
 accounts:[{key:"name",label:"Account name",required:true},{key:"type",label:"Account type",options:accountTypes},{key:"value",label:"Current value",required:true}],
 recurring:[{key:"name",label:"Name",required:true},{key:"amount",label:"Amount",required:true},{key:"type",label:"Type",options:["expense","income"]},{key:"category",label:"Category",required:true},{key:"frequency",label:"Frequency",options:["weekly","monthly","yearly"]},{key:"startDate",label:"Start date",type:"date",required:true},{key:"endDate",label:"End date",type:"date"},{key:"nextDate",label:"Next date",type:"date",required:true}],
 settings:[{key:"openingBalance",label:"Opening balance before your first recorded transaction",required:true}],
};
const amounts = ["amount","target","current","contribution","value","openingBalance"];
function read(storage: Pick<Storage,"getItem">, key: string) {try {return {plan:readFinancePlan(storage,key),error:""};} catch(error) {return {plan:financePlanDefaults(),error:error instanceof Error ? error.message : "Could not read Finance planning data."};}}

function TrendChart({title, points}: {title:string;points:{label:string;value:number}[]}) {
 const min=Math.min(0,...points.map(p=>p.value)), max=Math.max(1,...points.map(p=>p.value));
 const path=points.map((p,i)=>`${i ? "L":"M"}${25+(points.length===1 ? 225 : i/(points.length-1)*450)},${155-(p.value-min)/(max-min)*130}`).join(" ");
 return <section className={styles.panel}><h3>{title}</h3>{!points.length ? <p className={styles.empty}>No history yet.</p> : <><svg className={styles.trendChart} viewBox="0 0 500 195" role="img" aria-label={`${title}. Exact values in the data table below.`}>
  <line x1="25" x2="475" y1={155-(0-min)/(max-min)*130} y2={155-(0-min)/(max-min)*130} stroke="#dce1d2"/>
  <path d={path} fill="none" stroke="#71864c" strokeWidth="3"/>
  {points.map((p,i)=><circle key={p.label} cx={25+(points.length===1 ? 225:i/(points.length-1)*450)} cy={155-(p.value-min)/(max-min)*130} r="3" fill="#71864c"><title>{p.label}: {money(p.value)}</title></circle>)}
  <text x="25" y="185" fontSize="11" fill="#68725e">{points[0].label}</text><text x="475" y="185" textAnchor="end" fontSize="11" fill="#68725e">{points.at(-1)?.label}</text>
 </svg><details><summary>View chart data</summary><div className={styles.dataScroll}><table className={styles.dataTable}><caption>{title}</caption><thead><tr><th scope="col">Period</th><th scope="col">Amount</th></tr></thead><tbody>{points.map(p=><tr key={p.label}><th scope="row">{p.label}</th><td>{money(p.value)}</td></tr>)}</tbody></table></div></details></>}</section>;
}

export default function FinanceAnalytics({tab,month,entries,categories,ledgerKey,ledgerError,onEntries}: {tab:Tab;month:string;entries:Entry[];categories:CategoryMap;ledgerKey:string;ledgerError:boolean;onEntries:(entries:Entry[])=>void}) {
 const cloud=useCloud(), storage=useAccountStorage(), key=`${ledgerKey}.analytics`;
 const [state,setState]=useState(()=>read(storage,key));
 const [editor,setEditor]=useState<Editor|null>(null);
 const [deleting,setDeleting]=useState<{section:Exclude<Section,"settings">;id:string;name:string}|null>(null);
 const [error,setError]=useState(""); const [notice,setNotice]=useState("");
 const [range,setRange]=useState(3); const [trend,setTrend]=useState("daily");
 const [today,setToday]=useState(()=>dayKey(new Date()));
 const focus=useRef<HTMLElement|null>(null), panel=useRef<HTMLElement|null>(null);
 const plan=state.plan;
 useEffect(()=>{const refresh=(event:StorageEvent)=>{if(!event.key || event.key===key)setState(read(storage,key));};window.addEventListener("storage",refresh);const timer=window.setInterval(()=>setToday(dayKey(new Date())),60000);return()=>{window.removeEventListener("storage",refresh);window.clearInterval(timer);};},[storage,key]);
 const modal=!!(editor||deleting);
 useEffect(()=>{if(!modal)return;panel.current?.querySelector<HTMLElement>("input, select, button")?.focus();const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=overflow;};},[modal]);
 function close(){setEditor(null);setDeleting(null);setError("");focus.current?.focus();}
 function savePlan(next:FinancePlan){try{if(state.error)throw Error(state.error);writeFinancePlan(storage,key,next,plan);setState({plan:next,error:""});setError("");setNotice(cloud ? "Saved to the account sync queue." : "Saved locally.");return true;}catch(problem){setError(problem instanceof Error ? problem.message : "Save failed. Your existing data is unchanged.");return false;}}
 function open(section:Section,item?:{id:string}) {
  focus.current=document.activeElement as HTMLElement;setError("");
  const source=(section==="settings" ? plan : item) as unknown as Record<string,string|number> | undefined;
  const values=Object.fromEntries(fields[section].map(f=>[f.key,source?.[f.key]!==undefined ? amounts.includes(f.key) ? (Number(source[f.key])/100).toFixed(2):String(source[f.key]) : f.options?.[0] ?? (amounts.includes(f.key) ? "0" : f.type==="date" && f.key!=="endDate" && f.key!=="targetDate" ? today:"")]));
  if(section==="budgets" && !item)values.category=categories.expense[0];
  if(section==="recurring" && !item)values.category=categories.expense[0];
  setEditor({section,id:item?.id,values,baseline:JSON.stringify(plan)});
 }
 function remove(section:Exclude<Section,"settings">,id:string,name:string){focus.current=document.activeElement as HTMLElement;setError("");setDeleting({section,id,name});}
 function submit(event:FormEvent) {
  event.preventDefault();if(!editor)return;
  if(editor.baseline!==JSON.stringify(plan)){setError("Planning data changed. Close and reopen this editor.");return;}
  const v=Object.fromEntries(Object.entries(editor.values).map(([k,v])=>[k,v.trim()]));
  const numeric:Record<string,number>={};
  for(const f of fields[editor.section]) {if(f.required&&!v[f.key]){setError("Complete the required fields.");return;}if(amounts.includes(f.key)){const raw=v[f.key], negative=f.key==="openingBalance"&&raw.startsWith("-");const n=(raw==="0"||raw==="0.00")?0:parseAmount(negative?raw.slice(1):raw);if(n===null){setError("Use valid amounts with at most two decimal places.");return;}numeric[f.key]=negative?-n:n;}}
  const id=editor.id??crypto.randomUUID();let next=plan;
  if(editor.section==="settings")next={...plan,openingBalance:numeric.openingBalance};
  if(editor.section==="budgets")next={...plan,budgets:[...plan.budgets.filter(b=>b.id!==id),{id,month,category:v.category,amount:numeric.amount}]};
  if(editor.section==="goals")next={...plan,goals:[...plan.goals.filter(g=>g.id!==id),{id,name:v.name,target:numeric.target,current:numeric.current,contribution:numeric.contribution,targetDate:v.targetDate,notes:v.notes}]};
  if(editor.section==="accounts")next={...plan,accounts:[...plan.accounts.filter(a=>a.id!==id),{id,name:v.name,type:v.type as typeof accountTypes[number],value:numeric.value}]};
  if(editor.section==="recurring")next={...plan,recurring:[...plan.recurring.filter(r=>r.id!==id),{id,name:v.name,type:v.type as Entry["type"],amount:numeric.amount,category:v.category,frequency:v.frequency as "weekly"|"monthly"|"yearly",startDate:v.startDate,endDate:v.endDate,nextDate:v.nextDate,paused:plan.recurring.find(r=>r.id===id)?.paused??false}]};
  if(savePlan(next))close();
 }
 function recordDue() {
  try {
   if(state.error||ledgerError)throw Error("Reload readable Finance data before recording payments.");
   recurringBaseline(storage,ledgerKey,key,entries,plan);
   const next=recordRecurring(plan,entries,today,new Date().toISOString());
   if(JSON.stringify(next.plan)===JSON.stringify(plan)&&!next.added){setNotice("No due recurring payments to record.");return;}
   if(!window.confirm(`Record ${next.added} due recurring transaction(s) through ${today}?`))return;
   if(cloud){const ledgerId=documentId(ledgerKey,cloud.key),planId=documentId(key,cloud.key);if(!cloud.enqueueBatch([{kind:"document",value:[{id:ledgerId,value:JSON.stringify(next.entries)}],expected:{[ledgerId]:cloud.version("document",ledgerId)}},{kind:"document",value:[{id:planId,value:JSON.stringify(next.plan)}],expected:{[planId]:cloud.version("document",planId)}}]))throw Error("Recurring payments could not be queued.");}
   else {const original=storage.getItem(ledgerKey);storage.setItem(ledgerKey,JSON.stringify(next.entries));try{storage.setItem(key,JSON.stringify(next.plan));}catch(problem){try{if(original===null)storage.removeItem(ledgerKey);else storage.setItem(ledgerKey,original);}catch{onEntries(next.entries);}throw problem;}}
   setState({plan:next.plan,error:""});onEntries(next.entries);setNotice(`Recorded ${next.added} payments. Repeating this action will not duplicate them.`);setError("");
  }catch(problem){setError(problem instanceof Error ? problem.message : "Recording failed. Reload and retry.");}
 }
 const reserve=plan.goals.filter(g=>g.current<g.target).reduce((sum,g)=>sum+Math.min(g.contribution,g.target-g.current),0);
 const summary=monthlySummary(entries,month,today,plan.openingBalance,reserve);
 const realized=entries.filter(e=>e.date.startsWith(month)&&e.date<=today);
 const breakdown=[...new Set(realized.filter(e=>e.type==="expense").map(e=>e.category))].map(name=>({name,amount:realized.filter(e=>e.category===name&&e.type==="expense").reduce((s,e)=>s+e.amount,0)})).sort((a,b)=>b.amount-a.amount);
 const flow=cashFlow(entries,plan,today), worth=netWorth(plan.accounts);
 const actionButtons=(section:Exclude<Section,"settings">,item:{id:string},name:string)=><div className={styles.actions}><button className="text-button" onClick={()=>open(section,item)}>Edit</button><button className={styles.delete} onClick={()=>remove(section,item.id,name)}>Delete</button></div>;
 const cards=(items:{label:string;value:number;note?:string}[])=><div className={styles.stats}>{items.map(item=><section className={styles.stat} key={item.label}><span>{item.label}</span><strong>{money(item.value)}</strong>{item.note&&<small>{item.note}</small>}</section>)}</div>;
 if(tab==="Transactions")return null;
 return <div className={styles.analyticsBody}>
  {state.error&&<p role="alert" className={styles.error}>{state.error} <button onClick={()=>setState(read(storage,key))}>Reload planning data</button></p>}
  {error&&!modal&&<p role="alert" className={styles.error}>{error} <button onClick={()=>{setState(read(storage,key));setError("");}}>Reload</button></p>}
  <p role="status" className={styles.notice}>{notice}</p>
  <fieldset disabled={!!state.error||ledgerError} className={styles.analyticsBody}>
  {tab==="Overview"&&<>
   {cards([{label:"Monthly income",value:summary.income,note:`Previous month: ${money(summary.previous.income)} · change ${money(summary.incomeChange)}`},{label:"Monthly expenses",value:summary.expense,note:`Previous month: ${money(summary.previous.expense)} · change ${money(summary.expenseChange)}`},{label:"Net cash flow",value:summary.balance},{label:"Savings",value:summary.savings,note:"Positive monthly income less expenses; not a transfer."},{label:"Remaining money",value:summary.remainingMoney,note:`Cash balance less ${money(reserve)} planned monthly goal contributions.`},{label:"Average daily spending",value:summary.averageDaily,note:`Expenses divided by ${summary.elapsed} elapsed calendar days.`},{label:"Safe to spend / day",value:summary.safeToSpend,note:`${summary.remaining} days after today; upcoming recorded expenses reserved.`},{label:"Projected month-end balance",value:summary.projectedBalance,note:"Current cash + upcoming recorded income − greater of planned expenses or daily spending pace."}])}
   <section className={styles.panel}><div className={styles.panelHeading}><h3>Cash balance assumptions</h3><button className="secondary-button" onClick={()=>open("settings")}>Set opening balance</button></div><p>Opening balance: {money(plan.openingBalance)}. Cash is this opening balance plus all recorded income minus expenses through the reporting date. Future-dated records are scheduled, not yet received or spent. Recurring schedules are included in Cash Flow.</p><p>Historical months use the full month; current-month comparisons are month-to-date versus the previous full month. Goal balances and net-worth accounts are tracked separately and do not create transactions.</p></section>
   <div className={styles.analyticsGrid}><section className={styles.panel}><h3>Category spending</h3><ExpenseChart items={breakdown}/></section><TrendChart title="Monthly spending" points={spendingSeries(entries.filter(e=>e.date<=today),month,6).map(row=>({label:row.label,value:row.expense}))}/></div>
  </>}
  {tab==="Budget"&&<section className={styles.panel}><div className={styles.panelHeading}><h3>Budgets · {month}</h3><button className="primary-button" onClick={()=>open("budgets")}>+ Add budget</button></div><p>{Math.round(summary.fraction*100)}% of the selected month elapsed. Spending excludes future-dated records.</p><div className={styles.analyticsGrid}>{plan.budgets.filter(b=>b.month===month).map(b=>{const s=budgetSummary(b,entries,today);return <article className={styles.analyticsCard} key={b.id}><h4>{b.category}</h4><p>Budget {money(b.amount)} · Spent {money(s.spent)}</p><p>Remaining {money(s.remaining)} · {s.percent.toFixed(1)}% used</p><progress aria-label={`${b.category} budget used`} max={100} value={Math.min(100,s.percent)}/>{(s.faster||s.exceeded)&&<p className={styles.expense}>{s.exceeded ? "Over budget" : "Spending faster than month progress"}</p>}{actionButtons("budgets",b,b.category)}</article>;})}</div>{!plan.budgets.some(b=>b.month===month)&&<p className={styles.empty}>No budgets for this month. Add an expense category limit to get started.</p>}</section>}
  {tab==="Analytics"&&<>
   <section className={styles.panel}><div className={styles.panelHeading}><h3>Spending analytics · {month}</h3><label>History window<select value={range} onChange={e=>setRange(Number(e.target.value))}>{[3,6,12].map(n=><option key={n} value={n}>{n} months</option>)}</select></label></div><p>Average daily spending: {money(summary.averageDaily)}. Empty periods show zero; only recorded data is included.</p>{!realized.length&&<p className={styles.empty}>No recorded transactions in this month yet.</p>}<ExpenseChart items={breakdown}/></section>
   <section className={styles.panel}><label>Spending trend<select value={trend} onChange={e=>setTrend(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly (7-day blocks)</option><option value="monthly">Monthly</option></select></label></section>
   <TrendChart title={`${trend} spending trend`} points={trend==="monthly" ? spendingSeries(entries.filter(e=>e.date<=today),month,range).map(r=>({label:r.label,value:r.expense})) : spendingTrend(entries.filter(e=>e.date<=today),month,trend==="weekly").map(r=>({label:r.label,value:r.amount}))}/>
   <section className={styles.panel}><h3>Month-over-month comparison</h3><div className={styles.dataScroll}><table className={styles.dataTable}><thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead><tbody>{spendingSeries(entries.filter(e=>e.date<=today),month,range).map(r=><tr key={r.label}><th scope="row">{r.label}</th><td>{money(r.income)}</td><td>{money(r.expense)}</td><td>{money(r.balance)}</td></tr>)}</tbody></table></div></section>
   <div className={styles.analyticsGrid}><section className={styles.panel}><h3>Top expense categories</h3>{breakdown.slice(0,5).map(r=><p key={r.name}>{r.name} · {money(r.amount)}</p>)}{!breakdown.length&&<p>No expenses yet.</p>}</section><section className={styles.panel}><h3>Largest transactions</h3>{[...realized].filter(e=>e.type==="expense").sort((a,b)=>b.amount-a.amount).slice(0,5).map(e=><p key={e.id}>{e.title} · {e.date} · {money(e.amount)}</p>)}{!breakdown.length&&<p>No expenses yet.</p>}</section></div>
   <TrendChart title="Average spending by weekday" points={weekdaySpending(entries,month,today).map(r=>({label:r.label,value:r.average}))}/>
  </>}
  {tab==="Cash Flow"&&<>
   {cards([{label:"Current cash balance",value:flow.initial},{label:"Money in · next 7 days",value:flow.seven.income},{label:"Money out · next 7 days",value:flow.seven.expense},{label:"Money in · next 30 days",value:flow.thirty.income},{label:"Money out · next 30 days",value:flow.thirty.expense},{label:"Balance in 30 days",value:flow.points.at(-1)!.balance}])}
   <p>Forecast starts after today ({today}), independent of the selected reporting month. It combines recorded upcoming transactions and unrecorded active recurring schedules. It does not assume discretionary spending or future investment returns. Record overdue recurring payments to include them in current cash.</p>
   <TrendChart title="30-day cash flow forecast" points={[{label:today,value:flow.initial},...flow.points.map(p=>({label:p.date,value:p.balance}))]}/>
   <section className={styles.panel}><h3>Scheduled money by date</h3><div className={styles.dataScroll}><table className={styles.dataTable}><thead><tr><th>Date</th><th>Money in</th><th>Money out</th><th>Projected balance</th></tr></thead><tbody>{flow.points.map(p=><tr key={p.date}><th scope="row">{p.date}</th><td>{money(p.income)}</td><td>{money(p.expense)}</td><td>{money(p.balance)}</td></tr>)}</tbody></table></div></section>
  </>}
  {tab==="Goals"&&<section className={styles.panel}><div className={styles.panelHeading}><h3>Saving goals</h3><button className="primary-button" onClick={()=>open("goals")}>+ Add goal</button></div><div className={styles.analyticsGrid}>{plan.goals.map(g=>{const s=goalSummary(g,today);return <article className={styles.analyticsCard} key={g.id}><h4>{g.name}</h4><p>{money(g.current)} / {money(g.target)} · {s.percent.toFixed(1)}%</p><progress aria-label={`${g.name} progress`} max={100} value={s.percent}/><p>Remaining {money(s.remaining)} · Contribution {money(g.contribution)} / month</p><p>Target: {g.targetDate||"Not set"} · Estimated completion: {s.completionDate||"Set a monthly contribution"}</p><small>Estimate assumes the next contribution arrives next month.</small><p>{g.notes}</p>{actionButtons("goals",g,g.name)}</article>;})}</div>{!plan.goals.length&&<p className={styles.empty}>No saving goals. Add a target and planned monthly contribution.</p>}</section>}
  {tab==="Net Worth"&&<>
   {cards([{label:"Total assets",value:worth.assets},{label:"Total liabilities",value:worth.liabilities},{label:"Net worth",value:worth.total}])}
   <section className={styles.panel}><div className={styles.panelHeading}><h3>Assets & liabilities</h3><button className="primary-button" onClick={()=>open("accounts")}>+ Add account</button></div><p>Enter current values in THB. Debt is a positive liability amount. Investment remains a separate module; these balances are entered manually.</p><div className={styles.analyticsGrid}>{plan.accounts.map(a=><article className={styles.analyticsCard} key={a.id}><h4>{a.name}</h4><p>{a.type} · {money(a.value)}</p>{actionButtons("accounts",a,a.name)}</article>)}</div>{!plan.accounts.length&&<p className={styles.empty}>No accounts yet. Add cash, bank, investments or debt to track net worth.</p>}</section>
   <section className={styles.panel}><div className={styles.panelHeading}><h3>Monthly snapshots</h3><button className="secondary-button" disabled={!plan.accounts.length} onClick={()=>{if(month!==today.slice(0,7)){setError("Select the current month to capture current account values. Historical snapshots are preserved.");return;}if(plan.snapshots.some(s=>s.month===month)&&!window.confirm("Replace this month's snapshot with current account values?"))return;savePlan({...plan,snapshots:[...plan.snapshots.filter(s=>s.month!==month),{id:`net-worth:${month}`,month,assets:worth.assets,liabilities:worth.liabilities,updatedAt:new Date().toISOString()}]});}}>Save current month snapshot</button></div><p>Snapshots are captured explicitly and retain the values at that time. Capture one each month to build history.</p></section>
   <TrendChart title="Net worth history" points={[...plan.snapshots].sort((a,b)=>a.month.localeCompare(b.month)).map(s=>({label:s.month,value:s.assets-s.liabilities}))}/>
  </>}
  {tab==="Recurring"&&<section className={styles.panel}><div className={styles.panelHeading}><h3>Recurring income & expenses</h3><div className={styles.actions}><button className="secondary-button" onClick={recordDue}>Record due payments</button><button className="primary-button" onClick={()=>open("recurring")}>+ Add recurring</button></div></div><p>Schedules feed the forecast. Record due payments explicitly to add actual transactions and advance their next dates. Stable occurrence IDs prevent duplicates. Paused schedules do not forecast or post payments.</p><div className={styles.analyticsGrid}>{plan.recurring.map(r=>{const upcoming=recurringOccurrences(r,r.nextDate,shiftFinanceDay(today,30));return <article className={styles.analyticsCard} key={r.id}><h4>{r.name}</h4><p>{r.type} · {r.category} · {money(r.amount)} · {r.frequency}</p><p>{r.paused?"Paused":r.endDate&&r.nextDate>r.endDate ? "Ended" : r.nextDate<today ? `Overdue since ${r.nextDate}` : `Next: ${r.nextDate}`}</p><p>Upcoming: {upcoming.slice(0,4).join(", ")||"None in the next 30 days"}{upcoming.length>4&&` (+${upcoming.length-4} more)`}</p><button className="secondary-button" onClick={()=>savePlan({...plan,recurring:plan.recurring.map(item=>item.id===r.id?{...item,paused:!item.paused}:item)})}>{r.paused?"Resume":"Pause"}</button>{actionButtons("recurring",r,r.name)}</article>;})}</div>{!plan.recurring.length&&<p className={styles.empty}>No recurring items. Add regular income or expenses to plan upcoming cash flow.</p>}</section>}
  </fieldset>
  {modal&&<div className={styles.overlay} onKeyDown={event=>dialogKeyboard(event,close)}><section ref={panel} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="finance-plan-title"><div className={styles.panelHeading}><h3 id="finance-plan-title">{deleting ? "Delete item" : `${editor?.id?"Edit":"Set"} ${editor ? titles[editor.section]:""}`}</h3><button aria-label="Close finance planning dialog" onClick={close}>×</button></div>{error&&<p role="alert" className={styles.error}>{error}</p>}{deleting?<><p>Permanently delete “{deleting.name}”?</p><div className={styles.actions}><button autoFocus className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" onClick={()=>{if(savePlan({...plan,[deleting.section]:plan[deleting.section].filter(item=>item.id!==deleting.id)}))close();}}>Delete</button></div></>:editor&&<form onSubmit={submit}>{fields[editor.section].map(f=>{const options=f.key==="category"? [...new Set([...categories[editor.section==="recurring"&&editor.values.type==="income"?"income":"expense"],...(editor.values.category?[editor.values.category]:[])])]:f.options;return <label key={f.key}>{f.label}{options ? <select value={editor.values[f.key]} onChange={e=>setEditor({...editor,values:{...editor.values,[f.key]:e.target.value,...(f.key==="type"&&editor.section==="recurring"?{category:categories[e.target.value as Entry["type"]][0]}:{})}})}>{options.map(value=><option key={value}>{value}</option>)}</select>:f.key==="notes"?<textarea maxLength={2000} rows={3} value={editor.values[f.key]} onChange={e=>setEditor({...editor,values:{...editor.values,[f.key]:e.target.value}})}/>:<input autoFocus={f===fields[editor.section][0]} required={f.required} type={f.type??"text"} inputMode={amounts.includes(f.key)?"decimal":undefined} min={f.type==="date"?"1900-01-01":undefined} max={f.type==="date"?"9999-12-31":undefined} maxLength={120} value={editor.values[f.key]} onChange={e=>setEditor({...editor,values:{...editor.values,[f.key]:e.target.value}})}/>}</label>;})}<div className={styles.actions}><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Save</button></div></form>}</section></div>}
 </div>;
}
