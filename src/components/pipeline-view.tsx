"use client";
import { useState } from "react";
import type { AgentRun, PipelineImage } from "@/lib/types";
import { PipelineComposer, PipelineImages } from "./pipeline-composer";
import LivePipeline from "./live-pipeline";

export function AIStatus() {
  return <div className="pipeline-ai-status"><strong>ChatGPT · คัดลอกและวางด้วยตนเอง</strong><p>เว็บเตรียมคำสั่งโดยไม่เรียก AI API จากนั้นใช้ ChatGPT และนำคำตอบกลับมาบันทึกที่นี่</p></div>;
}

function RunDetails({ run, onSaveResponse }: { run: AgentRun; onSaveResponse: (id: string, response: string) => boolean }) {
  const [answer, setAnswer] = useState(run.finalResponse);
  const [feedback, setFeedback] = useState("");
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setFeedback("คัดลอกแล้ว"); }
    catch { setFeedback("คัดลอกอัตโนมัติไม่ได้ เลือกข้อความในช่องแล้วกด Ctrl+C"); }
  }
  return <section className="pipeline-board">
    <div className="run-header"><div><span className="eyebrow">{run.prompt ? "CHATGPT / MANUAL" : "ประวัติก่อนเปลี่ยนโหมด"}</span><h3>{run.userRequest}</h3></div><span className="demo-tag">{run.prompt ? run.status === "Complete" ? "บันทึกคำตอบแล้ว" : "รอคำตอบจาก ChatGPT" : run.status ?? "Demo เดิม"}</span></div>
    <PipelineImages images={run.images ?? []} />
    {run.prompt ? <>
      <section className="pipeline-manual-section"><h3>1. คัดลอกคำสั่งไปใช้ใน ChatGPT</h3><textarea aria-label="คำสั่งสำหรับ ChatGPT" readOnly value={run.prompt} rows={10} onFocus={(event) => event.currentTarget.select()} /><div className="pipeline-composer-actions"><button className="primary-button" onClick={() => void copy(run.prompt!)}>คัดลอกคำสั่ง</button><a className="secondary-button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">เปิด ChatGPT ↗</a></div><p>วางคำสั่งใน ChatGPT แล้วกดส่ง คำตอบจะไม่ถูกนำกลับมาอัตโนมัติ</p>
      {!!run.images?.length && <p>แนบรูปใน ChatGPT เองด้วย ดาวน์โหลดรูปที่เก็บไว้ด้านล่างได้:</p>}
      {run.images?.map((image) => <a className="secondary-button" key={image.id} href={image.dataUrl} download={image.name}>ดาวน์โหลด {image.name}</a>)}
      </section>
      <section className="pipeline-manual-section"><h3>2. วางคำตอบกลับมาบันทึก</h3><textarea aria-label="คำตอบจาก ChatGPT" placeholder="คัดลอกคำตอบจาก ChatGPT มาวางที่นี่…" value={answer} onChange={(event) => { setAnswer(event.target.value); setFeedback(""); }} rows={10} /><button className="primary-button" disabled={!answer.trim()} onClick={() => { setFeedback(onSaveResponse(run.id, answer) ? "บันทึกคำตอบแล้ว" : "บันทึกไม่สำเร็จ ข้อความยังอยู่ในช่อง กรุณาคัดลอกเก็บไว้"); }}>บันทึกคำตอบ</button></section>
    </> : <p>งานเดิมเก็บไว้ให้อ่านได้ สร้างคำสั่งใหม่จากรายการนี้เพื่อใช้โหมด ChatGPT</p>}
    {feedback && <p role="status">{feedback}</p>}
    {run.finalResponse && <section className="pipeline-final"><h3>คำตอบที่บันทึกไว้</h3><button className="secondary-button" onClick={() => void copy(run.finalResponse)}>คัดลอกคำตอบ</button><div className="pipeline-output">{run.finalResponse}</div></section>}
    {!run.prompt && run.steps.map((step) => <details key={step.id}><summary>{step.task}</summary><div className="pipeline-output">{step.output}</div></details>)}
  </section>;
}

export default function PipelineView({ runs, onRoute, onSaveResponse, storageError, onCreateTask }: { runs: AgentRun[]; onRoute: (request: string, images?: PipelineImage[]) => boolean; onSaveResponse: (id: string, response: string) => boolean; storageError: string; onCreateTask: (task: import("@/lib/types").Task) => void }) {
  const [selectedId, setSelectedId] = useState("");
  const run = runs.find((item) => item.id === selectedId) ?? runs[0];
  function start(request: string, images?: PipelineImage[]) { const ok = onRoute(request, images); if (ok) setSelectedId(""); return ok; }
  return <div className="content"><div className="view-intro pipeline-intro"><div><span className="section-kicker">AMARIS / AGENT PIPELINE</span><h2>From a request<br /><em>to a result.</em></h2><p>เลือก Agent → เริ่มงาน → ติดตามผลแบบเรียลไทม์</p></div><PipelineComposer onRoute={start} /></div><LivePipeline onCreateTask={onCreateTask} /><AIStatus />
    {storageError && <p className="pipeline-upload-error" role="alert">{storageError}</p>}
    {run && <><label className="pipeline-history">ประวัติงาน<select value={run.id} onChange={(event) => setSelectedId(event.target.value)}>{runs.map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.userRequest.slice(0, 60)}</option>)}</select></label><RunDetails key={run.id} run={run} onSaveResponse={onSaveResponse} /><button className="secondary-button" onClick={() => start(run.userRequest, run.images)}>สร้างคำสั่งใหม่จากรายการนี้ ↗</button></>}
    {!run && <div className="empty-pipeline"><div className="empty-orbit">🐼</div><h3>พร้อมเตรียมคำสั่งให้ Pai</h3><p>พิมพ์งานด้านบนเพื่อสร้างคำสั่งพร้อมบทบาทผู้ช่วย</p></div>}
    <p className="pipeline-image-note">ประวัติและรูปเก็บในเบราว์เซอร์เครื่องนี้ การล้างข้อมูลเว็บไซต์จะลบประวัติด้วย</p>
  </div>;
}
