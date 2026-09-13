"use client";
import { useState, type FormEvent } from "react";
import type { CategoryMap, Entry } from "@/lib/finance";
import styles from "./finance-view.module.css";

export default function FinanceCategories({ value, onChange }: { value: CategoryMap; onChange: (type: Entry["type"], name: string, remove: boolean) => string | null }) {
  const [type, setType] = useState<Entry["type"]>("expense");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  function add(event: FormEvent) { event.preventDefault(); const problem = onChange(type, name, false); setError(problem ?? ""); if (!problem) setName(""); }
  return <details className={styles.categoryManager}><summary>จัดการหมวดหมู่</summary><p>เพิ่มหรือลบตัวเลือกสำหรับรายการใหม่ รายการเก่ายังคงหมวดหมู่และยอดเงินเดิม</p><div className={styles.tabs}>{(["expense", "income"] as const).map((item) => <button type="button" key={item} aria-pressed={type === item} onClick={() => { setType(item); setError(""); }}>{item === "income" ? "รายรับ" : "รายจ่าย"}</button>)}</div><form className={styles.categoryForm} onSubmit={add}><input aria-label="ชื่อหมวดหมู่ใหม่" placeholder="ชื่อหมวดหมู่ใหม่" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /><button className="secondary-button" type="submit">+ เพิ่ม</button></form>{error && <p className={styles.error} role="alert">{error}</p>}<ul className={styles.categoryList}>{value[type].map((item) => <li key={item}><span>{item}</span><button type="button" aria-label={`ลบหมวดหมู่ ${item}`} onClick={() => setError(onChange(type, item, true) ?? "")}>×</button></li>)}</ul></details>;
}
