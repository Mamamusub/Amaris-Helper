"use client";

import { useState } from "react";
import { readStorage, writeStorage } from "@/lib/storage";
import styles from "./build-lab.module.css";

const templates = [
  { name: "Portfolio", icon: "↗", description: "พื้นที่เล่าเรื่องผลงานและตัวตน", brief: "สร้างเว็บ Portfolio สำหรับสมัครงาน แสดงประวัติ ทักษะ ผลงาน 3 ชิ้น และช่องทางติดต่อ", stack: "Next.js + CSS Modules" },
  { name: "Personal dashboard", icon: "▦", description: "รวมงานและข้อมูลไว้ในที่เดียว", brief: "สร้าง Dashboard ส่วนตัว มีรายการงาน สรุปความคืบหน้า และบันทึกประจำวัน เก็บข้อมูลในเบราว์เซอร์", stack: "React + localStorage" },
  { name: "Landing page", icon: "◈", description: "เปลี่ยนไอเดียเป็นหน้าเปิดตัว", brief: "สร้าง Landing page สำหรับผลิตภัณฑ์ใหม่ มีจุดเด่น วิธีใช้งาน คำถามที่พบบ่อย และปุ่มติดต่อ", stack: "HTML + CSS + JavaScript" },
];
const checklist = ["กำหนดผู้ใช้และปัญหาที่ต้องการแก้", "เลือกฟีเจอร์หลักสำหรับเวอร์ชันแรก", "ร่างหน้าจอและเส้นทางการใช้งาน", "สร้างต้นแบบด้วยข้อมูลตัวอย่าง", "ทดสอบบนมือถือและตรวจการใช้งาน"];
type Draft = { name: string; brief: string; stack: string; done: number[]; notes: string };
const initial: Draft = { name: "My first project", brief: "", stack: templates[0].stack, done: [], notes: "" };
function loadDraft(): Draft {
  const value = readStorage<Partial<Draft> | null>("agent-helper.build-lab", null);
  if (!value || typeof value !== "object") return initial;
  return { name: typeof value.name === "string" ? value.name : initial.name, brief: typeof value.brief === "string" ? value.brief : "", stack: typeof value.stack === "string" ? value.stack : initial.stack, notes: typeof value.notes === "string" ? value.notes : "", done: Array.isArray(value.done) ? value.done.filter((n) => Number.isInteger(n) && n >= 0 && n < checklist.length) : [] };
}

export default function BuildLab() {
  const [draft, setDraft] = useState(loadDraft);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"plan" | "prompt">("plan");
  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setFeedback("");
    try { writeStorage("agent-helper.build-lab", next); setError(""); }
    catch { setError("บันทึกไม่สำเร็จ ข้อมูลยังอยู่ในหน้านี้ กรุณาคัดลอกเก็บไว้ก่อนออก"); }
  }
  const prompt = `ช่วยเป็นคู่คิดในการพัฒนาโปรเจกต์ ${draft.name || "Untitled project"}\n\nโจทย์: ${draft.brief}\nเทคโนโลยี: ${draft.stack}\n\nเริ่มด้วยสรุปขอบเขต MVP โครงสร้างหน้าจอ และแผนพัฒนาทีละขั้น จากนั้นเสนอวิธีทดสอบ ใช้ข้อมูลตัวอย่างและไม่ใช้บริการที่ต้องใส่ API Key หากข้อมูลไม่พอให้ถามก่อน\n\nบันทึกเพิ่มเติม: ${draft.notes || "ไม่มี"}`;
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setFeedback("คัดลอกคำสั่งแล้ว นำไปวางใน ChatGPT ได้เลย"); }
    catch { setFeedback("คัดลอกอัตโนมัติไม่ได้ เลือกข้อความในช่องคำสั่งแล้วคัดลอกเองได้"); }
  }
  return <div className={`content ${styles.lab}`}>
    <div className={styles.heading}><div><span className="section-kicker">YOUR IDEAS, IN PROGRESS</span><h2>A little idea.<br /><em>A real beginning.</em></h2><p>จัดไอเดียให้ชัด แล้วค่อย ๆ สร้างโปรเจกต์ของคุณ</p></div><span className={styles.badge}><i /> ไม่ต้องใช้ API Key</span></div>
    <section className={styles.templates} aria-label="เทมเพลตโปรเจกต์">{templates.map((template, index) => <button key={template.name} onClick={() => { update({ name: template.name, brief: template.brief, stack: template.stack, done: [] }); setTab("plan"); }}><span className={styles.templateIcon}>{template.icon}</span><small>STARTER / 0{index + 1}</small><strong>{template.name}<span>↗</span></strong><p>{template.description}</p></button>)}</section>
    <div className={styles.workspace}>
      <section className={styles.editor}><div className={styles.sectionTitle}><span>01 / PROJECT BRIEF</span><small>{error ? "ยังไม่ได้บันทึก" : "บันทึกในเบราว์เซอร์นี้"}</small></div><h3>วันนี้อยากสร้างอะไร?</h3><label>ชื่อโปรเจกต์<input value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="ตั้งชื่อไอเดียของคุณ" /></label><label>ไอเดียและเป้าหมาย<textarea rows={5} value={draft.brief} onChange={(event) => update({ brief: event.target.value })} placeholder="สร้างอะไร ให้ใครใช้ และอยากให้ทำอะไรได้บ้าง…" /></label><label>เทคโนโลยีที่อยากใช้<select value={draft.stack} onChange={(event) => update({ stack: event.target.value })}>{templates.map((template) => <option key={template.stack}>{template.stack}</option>)}</select></label><label>บันทึกเพิ่มเติม<textarea rows={3} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="ข้อจำกัด สิ่งที่อยากลอง หรือคำตอบที่ได้จาก ChatGPT" /></label><button className="primary-button" disabled={!draft.brief.trim()} onClick={() => setTab("prompt")}>เตรียมคำสั่งสำหรับ ChatGPT ↗</button><p className={styles.hint}>ประกอบคำสั่งจากข้อมูลที่กรอก โดยยังไม่มีการเรียก AI</p></section>
      <section className={styles.plan}><div className={styles.tabs} role="tablist" aria-label="เครื่องมือโปรเจกต์"><button id="lab-plan-tab" role="tab" aria-selected={tab === "plan"} aria-controls="lab-panel" onClick={() => setTab("plan")}>Build checklist</button><button id="lab-prompt-tab" role="tab" aria-selected={tab === "prompt"} aria-controls="lab-panel" onClick={() => setTab("prompt")}>ChatGPT prompt ↗</button></div><div id="lab-panel" role="tabpanel" aria-labelledby={`lab-${tab}-tab`}>
      {tab === "plan" ? <><div className={styles.planHeading}><span className="section-kicker">02 / SMALL STEPS</span><h3>Make room for progress.</h3><p>เช็กลิสต์เริ่มต้น · ปรับขอบเขตงานไว้ในบันทึกได้</p></div><div className={styles.progressLabel}><span>ความคืบหน้า</span><strong>{draft.done.length} / {checklist.length}</strong></div><progress max={checklist.length} value={draft.done.length} aria-label="ความคืบหน้าโปรเจกต์" /><div className={styles.checklist}>{checklist.map((item, index) => <label key={item}><input type="checkbox" checked={draft.done.includes(index)} onChange={() => update({ done: draft.done.includes(index) ? draft.done.filter((n) => n !== index) : [...draft.done, index] })} /><span><small>STEP 0{index + 1}</small>{item}</span></label>)}</div><div className={styles.tip}><strong>เริ่มเล็ก ๆ ก็เป็นการเริ่มที่ดี</strong><p>เลือกฟีเจอร์สำคัญแค่ 1–3 อย่าง แล้วทำให้ลองใช้ได้ก่อนเพิ่มส่วนอื่น</p></div></> : <div className={styles.prompt}><h3>พร้อมไปต่อกับ ChatGPT</h3><p>คัดลอกคำสั่งไปส่งเอง แล้วนำข้อสรุปกลับมาเก็บในบันทึก</p><textarea readOnly aria-label="คำสั่งสำหรับ ChatGPT" value={prompt} rows={14} onFocus={(event) => event.currentTarget.select()} /><div><button className="primary-button" disabled={!draft.brief.trim()} onClick={() => void copyPrompt()}>คัดลอกคำสั่ง</button><a className="secondary-button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">เปิด ChatGPT ↗</a></div></div>}
      </div></section>
    </div>{error && <p role="alert">{error}</p>}{feedback && <p role="status">{feedback}</p>}
    <p className={styles.footer}>LOCAL WORKSPACE <span>ไอเดียและเช็กลิสต์เก็บไว้ในเครื่องนี้ · เลือกเทมเพลตเพื่อแทนที่โจทย์และเริ่มเช็กลิสต์ใหม่</span></p>
  </div>;
}
