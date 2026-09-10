"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { agents, getAgent } from "@/lib/agents";
import type { Agent, Task } from "@/lib/types";

type PipelineStatus = "idle" | "queued" | "analyzing" | "working" | "completed" | "failed";
type PipelineResult = { summary: string; steps: { title: string; description: string; status: "pending" | "complete" }[]; suggestedTasks: { title: string; priority: "high" | "medium" | "low"; dueDate: string | null }[]; reply: string };

const statusLabels: Record<PipelineStatus, string> = { idle: "พร้อมเริ่มงาน", queued: "รอเริ่มงาน", analyzing: "กำลังวิเคราะห์คำสั่ง", working: "กำลังทำงาน", completed: "ทำงานเสร็จแล้ว", failed: "เกิดข้อผิดพลาด" };

export default function LivePipeline({ onCreateTask }: { onCreateTask: (task: Task) => void }) {
  const [agent, setAgent] = useState(agents[0].id);
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [feedback, setFeedback] = useState("");
  const timers = useRef<number[]>([]);
  const busy = status === "queued" || status === "analyzing" || status === "working";
  const selectedAgent = getAgent(agent) ?? agents[0];

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  async function run(event: FormEvent) {
    event.preventDefault();
    if (busy || !command.trim()) return;
    timers.current.forEach((timer) => window.clearTimeout(timer));
    setResult(null); setError(""); setFeedback(""); setStartedAt(new Date().toISOString()); setStatus("queued");
    timers.current.push(window.setTimeout(() => setStatus("analyzing"), 350));
    timers.current.push(window.setTimeout(() => setStatus("working"), 1100));
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 95000);
      let response: Response;
      try {
        response = await fetch("/api/pipeline/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: agent, command: command.trim() }), signal: controller.signal });
      } finally { window.clearTimeout(timeout); }
      const data = await response.json() as { result?: PipelineResult; error?: string };
      if (!response.ok) throw new Error(data.error || "เริ่มงานไม่สำเร็จ");
      setResult(data.result ?? null); setStatus("completed");
    } catch (runError) {
      setError(runError instanceof DOMException && runError.name === "AbortError" ? "Agent ใช้เวลานานเกินไป กรุณาลองใหม่หรือลดความยาวคำสั่ง" : runError instanceof Error ? runError.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
      setStatus("failed");
    } finally {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    }
  }

  function reset() { timers.current.forEach((timer) => window.clearTimeout(timer)); setStatus("idle"); setResult(null); setError(""); setFeedback(""); setCommand(""); }
  async function copyResult() { if (!result) return; try { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setFeedback("คัดลอกผลลัพธ์แล้ว"); } catch { setFeedback("คัดลอกไม่ได้ กรุณาเลือกข้อความแล้วกด Ctrl+C"); } }
  function addSuggestedTask(item: PipelineResult["suggestedTasks"][number]) {
    const now = new Date().toISOString();
    onCreateTask({ id: `pipeline-task-${crypto.randomUUID()}`, title: item.title, description: `Suggested by ${selectedAgent.name} agent.`, team: selectedAgent.team, assignedAgent: selectedAgent.id, status: "Planned", priority: item.priority === "high" ? "High" : item.priority === "low" ? "Low" : "Medium", deadline: item.dueDate ?? "", createdAt: now, updatedAt: now });
    setFeedback(`เพิ่ม ${item.title} เข้า Tasks แล้ว`);
  }

  return <section className="live-pipeline">
    <div className="live-pipeline-heading"><div><span className="eyebrow">LIVE AGENT RUN</span><h3>Start a focused run</h3><p>เลือก Agent จาก Team Grid ส่งคำสั่ง และติดตามงานแบบเรียลไทม์</p></div><span className={`live-run-status ${status}`}><i />{statusLabels[status]}</span></div>
    <form className="live-pipeline-form" onSubmit={run}>
      <label>Agent<select value={agent} onChange={(event) => setAgent(event.target.value)} disabled={busy}>{agents.map((item: Agent) => <option key={item.id} value={item.id}>{item.avatar} {item.name} · {item.team} · {item.role}</option>)}</select></label>
      <label>คำสั่ง<textarea value={command} maxLength={4000} onChange={(event) => setCommand(event.target.value)} placeholder="เช่น ช่วยวางแผนปรับ CV ให้เสร็จภายใน 7 วัน" rows={4} disabled={busy} /></label>
      <div className="live-pipeline-actions"><button className="primary-button" type="submit" disabled={busy || !command.trim()}>{busy ? "กำลังประมวลผล…" : "เริ่มงาน"}</button><small>ระบบใช้ API key จากเซิร์ฟเวอร์ใน .env.local และจะไม่ส่งคีย์ผ่านเบราว์เซอร์</small></div>
    </form>
    {busy && <div className="live-pipeline-progress"><div className="live-agent-icon">{selectedAgent.avatar}</div><div><strong>{selectedAgent.name} กำลังทำงาน</strong><p>{status === "queued" ? "กำลังเข้าคิวงาน…" : status === "analyzing" ? "กำลังวิเคราะห์คำสั่ง…" : "กำลังสร้างคำตอบตามบทบาทของ Agent…"}</p><div className="progress-dots"><i /><i /><i /></div></div><time>{startedAt && new Date(startedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time></div>}
    {error && <div className="live-pipeline-error" role="alert"><strong>ทำงานไม่สำเร็จ</strong><p>{error}</p><button className="secondary-button" type="button" onClick={reset}>ลองใหม่</button></div>}
    {result && <div className="live-pipeline-result"><div className="result-heading"><div><span className="eyebrow">{selectedAgent.name} / RESULT</span><h4>{result.summary}</h4></div><button className="secondary-button" type="button" onClick={() => void copyResult()}>คัดลอกผลลัพธ์</button></div><p>{result.reply}</p><div className="pipeline-result-steps">{result.steps.map((step) => <article key={step.title}><strong>{step.title}</strong><p>{step.description}</p><span>{step.status === "complete" ? "เสร็จแล้ว" : "รอดำเนินการ"}</span></article>)}</div>{result.suggestedTasks.length > 0 && <div className="pipeline-suggested-tasks"><h4>Suggested tasks</h4>{result.suggestedTasks.map((item) => <div key={`${item.title}-${item.dueDate}`}><span>{item.title}{item.dueDate ? ` · ${item.dueDate}` : ""}</span><button className="secondary-button" type="button" onClick={() => addSuggestedTask(item)}>เพิ่ม Task</button></div>)}</div>}<button className="text-button" type="button" onClick={reset}>เริ่มคำสั่งใหม่ ↗</button></div>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
