"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { categories as defaultCategories, readCategories, changeCategory, financeMonth, money, parseAmount, readEntries, totals, validDate, type Entry } from "@/lib/finance";
import { dayKey } from "@/lib/calendar";
import { useCloud, useAccountStorage } from "./account-boundary";
import { dialogKeyboard } from "./dialog-keyboard";
import styles from "./finance-view.module.css";
import FinanceCalendar from "./finance-calendar";
import ExpenseChart from "./expense-chart";
import FinanceCategories from "./finance-categories";

type Draft = { type: Entry["type"]; amount: string; title: string; category: string; date: string; note: string };
const fresh = (): Draft => ({ type: "expense", amount: "", title: "", category: defaultCategories.expense[0], date: dayKey(new Date()), note: "" });
function initial(key: string, storage: Pick<Storage, "getItem">) {
  try { return { entries: readEntries(storage, key), error: "" }; }
  catch { return { entries: [] as Entry[], error: "อ่านข้อมูลบัญชีไม่สำเร็จ กรุณาลองโหลดข้อมูลอีกครั้ง" }; }
}
export default function FinanceView() {
  const cloud = useCloud();
  const storage = useAccountStorage();
  const key = `${cloud?.key ?? "agent-helper"}.finance.v1`;
  const categoryKey = `${key}.categories`;
  const [categories, setCategories] = useState(() => { try { return readCategories(storage, categoryKey); } catch { return defaultCategories; } });
  const [state, setState] = useState(() => initial(key, storage));
  const [month, updateMonth] = useState(() => financeMonth(storage, key, state.entries, dayKey(new Date()).slice(0, 7)));
  function setMonth(value: string) {
    updateMonth(value);
    try { storage.setItem(`${key}.month`, value); } catch { /* Saving an entry must not fail because of a view preference. */ }
  }
  const [filter, setFilter] = useState<"all" | Entry["type"]>("all");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ original: Entry | null; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === key || event.key === null) setState(initial(key, storage)); if (event.key === categoryKey || event.key === null) { try { setCategories(readCategories(storage, categoryKey)); } catch { /* Keep last readable category list. */ } } };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [key, categoryKey, storage]);
  const monthly = state.entries.filter((e) => e.date.startsWith(month));
  const summary = totals(monthly);
  const shown = monthly.filter((e) => (filter === "all" || e.type === filter) && (!category || e.category === category) && `${e.title} ${e.note} ${e.category}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const days = [...new Set(shown.map((e) => e.date))];
  const availableCategories = (type: Entry["type"]) => [...new Set([...categories[type], ...state.entries.filter((entry) => entry.type === type).map((entry) => entry.category)])];
  const breakdown = availableCategories("expense").map((name) => ({ name, amount: monthly.filter((e) => e.type === "expense" && e.category === name).reduce((sum, e) => sum + e.amount, 0) })).filter((e) => e.amount).sort((a, b) => b.amount - a.amount);
  function open(entry: Entry | null = null) {
    returnFocus.current = document.activeElement as HTMLElement;
    setError("");
    setEditor({ original: entry, draft: entry ? { ...entry, amount: (entry.amount / 100).toFixed(2) } : { ...fresh(), category: categories.expense[0] } });
  }
  function close() { setEditor(null); setDeleting(null); setError(""); returnFocus.current?.focus(); }
  function commit(original: Entry | null, next: Entry | null) {
    try {
      const latest = readEntries(storage, key);
      if (original && JSON.stringify(latest.find((e) => e.id === original.id)) !== JSON.stringify(original)) {
        setState({ entries: latest, error: "" });
        setError("รายการนี้เปลี่ยนในอีกแท็บแล้ว กรุณาปิดและเปิดรายการใหม่");
        return false;
      }
      const entries = latest.filter((e) => e.id !== original?.id);
      if (next) entries.push(next);
      storage.setItem(key, JSON.stringify(entries));
      setState({ entries, error: "" });
      setError("");
      return true;
    } catch { setError("บันทึกไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่ กรุณาตรวจสอบพื้นที่จัดเก็บแล้วลองใหม่"); return false; }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const { draft, original } = editor;
    const amount = parseAmount(draft.amount);
    if (!amount || !draft.title.trim() || !validDate(draft.date) || !(categories[draft.type].includes(draft.category) || (original?.type === draft.type && original.category === draft.category))) { setError("กรอกชื่อ วันที่ และจำนวนเงินมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)"); return; }
    const next: Entry = { ...draft, title: draft.title.trim(), note: draft.note.trim(), amount, id: original?.id ?? crypto.randomUUID(), updatedAt: new Date().toISOString() };
    if (!commit(original, next)) return;
    setMonth(next.date.slice(0, 7)); setFilter("all"); setCategory(""); setSearch("");
    setNotice(original ? "แก้ไขรายการแล้ว" : "บันทึกรายการแล้ว");
    if ((event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "continue") {
      setEditor({ original: null, draft: { ...fresh(), type: draft.type, category: draft.category, date: draft.date } });
      amountInput.current?.focus();
    } else close();
  }
  function update(patch: Partial<Draft>) { setEditor((current) => current && { ...current, draft: { ...current.draft, ...patch } }); }
  function manageCategory(type: Entry["type"], name: string, remove: boolean): string | null {
    try {
      const next = changeCategory(readCategories(storage, categoryKey), type, name, remove);
      storage.setItem(categoryKey, JSON.stringify(next)); setCategories(next); return null;
    } catch (problem) { return problem instanceof Error ? problem.message : "Category update failed"; }
  }
  return <div className={`content ${styles.page}`}>
    <header className={styles.heading}><div><span className="section-kicker">PERSONAL MONEY JOURNAL</span><h2>บัญชีรายรับรายจ่าย</h2><p>เห็นเงินเข้า เงินออก และสิ่งที่ใช้ไปในแต่ละเดือน</p></div><div className={styles.actions}><label>เดือน<input aria-label="เลือกเดือน" type="month" min="1900-01" max="9999-12" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} /></label><button className="primary-button" disabled={!!state.error} onClick={() => open()}>+ เพิ่มรายการ</button></div></header>
    <p className={styles.storage}>{cloud ? "ซิงก์รายรับรายจ่ายกับบัญชีที่เข้าสู่ระบบ · ดูสถานะด้านบน" : "บันทึกในเบราว์เซอร์นี้ · เข้าสู่ระบบเพื่อซิงก์ข้ามอุปกรณ์"}</p>
    {state.error && <div role="alert" className={styles.error}>{state.error} <button onClick={() => setState(initial(key, storage))}>โหลดข้อมูลอีกครั้ง</button></div>}
    <div role="status" className={styles.notice}>{notice}</div>
    <div className={styles.stats}>{([["รายรับเดือนนี้", summary.income, "income"], ["รายจ่ายเดือนนี้", summary.expense, "expense"], ["คงเหลือสุทธิ", summary.balance, "balance"]] as const).map(([label, amount, tone]) => <section key={tone} className={`${styles.stat} ${styles[tone]}`}><span>{label}</span><strong>{money(amount)}</strong><small>{tone === "balance" ? "รายรับ − รายจ่าย ของเดือนที่เลือก" : `${monthly.filter((e) => e.type === tone).length} รายการ`}</small></section>)}</div>
    {!!state.entries.length && <div className={styles.savedMonths}><span>ข้อมูลที่บันทึกไว้ทั้งหมด {state.entries.length} รายการ</span><label>เดือนที่มีข้อมูล<select aria-label="ไปยังเดือนที่มีรายการบันทึก" value={state.entries.some((entry) => entry.date.startsWith(month)) ? month : ""} onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setFilter("all"); setCategory(""); setSearch(""); } }}><option value="" disabled>เลือกเดือนที่มีข้อมูล</option>{[...new Set(state.entries.map((entry) => entry.date.slice(0, 7)))].sort().reverse().map((value) => <option key={value} value={value}>{value} · {state.entries.filter((entry) => entry.date.startsWith(value)).length} รายการ</option>)}</select></label></div>}
    <FinanceCategories value={categories} onChange={manageCategory} />
    <div className={styles.columns}><div className={styles.sideRail}><section className={styles.panel}><div className={styles.panelHeading}><h3>รายการบัญชี</h3><span>{shown.length} รายการ</span></div><div className={styles.filters}><div className={styles.tabs}>{([["all", "ทั้งหมด"], ["income", "รายรับ"], ["expense", "รายจ่าย"]] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setCategory(""); }}>{label}</button>)}</div><input aria-label="ค้นหารายการ" placeholder="ค้นหาชื่อหรือหมายเหตุ…" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="กรองหมวดหมู่" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">ทุกหมวดหมู่</option>{(filter === "all" ? [...new Set([...availableCategories("income"), ...availableCategories("expense")])] : availableCategories(filter)).map((c) => <option key={c}>{c}</option>)}</select></div>
      <div className={styles.ledgerScroll} role="region" aria-label="Account entries" tabIndex={0}>
      {!shown.length && <div className={styles.empty}><span>฿</span><h3>{monthly.length ? "ไม่พบรายการที่ตรงกับตัวกรอง" : "เริ่มบันทึกเงินเข้าและเงินออก"}</h3><p>{monthly.length ? "ลองเปลี่ยนคำค้นหาหรือหมวดหมู่" : "เพิ่มรายการแรกของเดือนนี้ เพื่อดูภาพรวมการใช้จ่าย"}</p>{!monthly.length && <button className="secondary-button" disabled={!!state.error} onClick={() => open()}>+ เพิ่มรายการแรก</button>}</div>}
      {days.map((date) => { const entries = shown.filter((e) => e.date === date); const day = totals(entries); return <section key={date} className={styles.day}><div className={styles.dayHeading}><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</strong><small>ตามตัวกรอง: เข้า {money(day.income)} · ออก {money(day.expense)}</small></div>{entries.map((entry) => <div key={entry.id} className={styles.row}><button className={styles.entry} aria-label={`แก้ไข ${entry.title}`} onClick={() => open(entry)}><span className={`${styles.symbol} ${styles[entry.type]}`}>{entry.type === "income" ? "↙" : "↗"}</span><span className={styles.description}><strong>{entry.title}</strong><small>{entry.category}{entry.note && ` · ${entry.note}`}</small></span><strong className={styles[entry.type]}>{entry.type === "income" ? "+" : "−"}{money(entry.amount)}</strong></button><button className={styles.delete} aria-label={`ลบ ${entry.title}`} onClick={() => { returnFocus.current = document.activeElement as HTMLElement; setError(""); setDeleting(entry); }}>ลบ</button></div>)}</section>; })}
      </div>
    </section><aside className={styles.panel}><div className={styles.panelHeading}><h3>สรุปรายจ่าย</h3><span>ทั้งเดือน</span></div><ExpenseChart items={breakdown} /></aside></div><FinanceCalendar month={month} entries={monthly} onMonth={setMonth} /></div>
    {(editor || deleting) && <div className={styles.overlay} onKeyDown={(event) => dialogKeyboard(event, close)}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="finance-dialog-title"><div className={styles.panelHeading}><h3 id="finance-dialog-title">{deleting ? "ลบรายการบัญชี" : editor?.original ? "แก้ไขรายการ" : "เพิ่มรายการ"}</h3><button type="button" aria-label="ปิด" onClick={close}>×</button></div>{error && <p role="alert" className={styles.error}>{error}</p>}{deleting ? <><p>ลบ “{deleting.title}” จำนวน {money(deleting.amount)}?</p><div className={styles.actions}><button autoFocus className="secondary-button" onClick={close}>ยกเลิก</button><button className="primary-button" onClick={() => { if (commit(deleting, null)) { setNotice("ลบรายการแล้ว"); close(); } }}>ยืนยันลบ</button></div></> : editor && <form onSubmit={save}><div className={styles.tabs}>{(["expense", "income"] as const).map((type) => <button type="button" key={type} aria-pressed={editor.draft.type === type} onClick={() => update({ type, category: categories[type][0] })}>{type === "income" ? "รายรับ" : "รายจ่าย"}</button>)}</div><label>จำนวนเงิน (บาท)<input ref={amountInput} autoFocus className={styles.amount} inputMode="decimal" required placeholder="0.00" value={editor.draft.amount} onChange={(e) => update({ amount: e.target.value })} /></label><label>ชื่อรายการ<input required maxLength={120} placeholder="เช่น อาหารกลางวัน" value={editor.draft.title} onChange={(e) => update({ title: e.target.value })} /></label><div className={styles.formGrid}><label>หมวดหมู่<select value={editor.draft.category} onChange={(e) => update({ category: e.target.value })}>{[...new Set([...categories[editor.draft.type], ...(editor.original?.type === editor.draft.type ? [editor.original.category] : [])])].map((c) => <option key={c}>{c}</option>)}</select></label><label>วันที่<input type="date" required min="1900-01-01" max="9999-12-31" value={editor.draft.date} onChange={(e) => update({ date: e.target.value })} /></label></div><label>หมายเหตุ (ไม่บังคับ)<textarea rows={3} maxLength={500} value={editor.draft.note} onChange={(e) => update({ note: e.target.value })} /></label><div className={styles.actions}><button type="button" className="secondary-button" onClick={close}>ยกเลิก</button>{!editor.original && <button type="submit" value="continue" className="secondary-button">บันทึกแล้วเพิ่มต่อ</button>}<button type="submit" value="save" className="primary-button">บันทึก</button></div></form>}</section></div>}
  </div>;
}
