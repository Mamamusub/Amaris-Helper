"use client";

import { useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/types";

type AgentId = "planner" | "study" | "career" | "builder";
type PipelineStatus = "idle" | "queued" | "analyzing" | "working" | "completed" | "failed";
type PipelineResult = { summary: string; steps: { title: string; description: string; status: "pending" | "complete" }[]; suggestedTasks: { title: string; priority: "high" | "medium" | "low"; dueDate: string | null }[]; reply: string };

const agentLabels: Record<AgentId, { name: string; description: string; team: Task["team"]; assignedAgent: string; icon: string }> = {
  planner: { name: "Planner", description: "วางแผนและจัดลำดับงาน", team: "Orchestrator", assignedAgent: "secretary", icon: "◈" },
  study: { name: "Study", description: "การเรียนและการสอบ", team: "Study", assignedAgent: "researcher", icon: "✦" },
  career: { name: "Career", description: "CV, portfolio และการหางาน", team: "Career", assignedAgent: "career-coach", icon: "↗" },
  builder: { name: "Builder", description: "การสร้างแอปและงานด้านเทคนิค", team: "Development", assignedAgent: "product-planner", icon: "⌘" },
};

const statusLabels: Record<PipelineStatus, string> = { idle: "พร้อมเริ่มงาน", queued: "รอเริ่มงาน", analyzing: "กำลังวิเคราะห์คำสั่ง", working: "กำลังทำงาน", completed: "ทำงานเสร็จแล้ว", failed: "เกิดข้อผิดพลาด" };

export default function LivePipeline({ onCreateTask }: { onCreateTask: (task: Task) => void }) {
  const [agent, setAgent] = useState<AgentId>("planner");
  const [command, setCommand] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [feedback, setFeedback] = useState("");
  const timers = useRef<number[]>([]);
  const busy = status === "queued" || status === "analyzing" || status === "working";

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !command.trim() || !apiKey.trim()) return;
    timers.current.forEach((timer) => window.clearTimeout(timer));
    setResult(null); setError(""); setFeedback(""); setStartedAt(new Date().toISOString()); setStatus("queued");
    timers.current.push(window.setTimeout(() => setStatus("analyzing"), 350));
    timers.current.push(window.setTimeout(() => setStatus("working"), 1100));
    const requestKey = apiKey;
    setApiKey("");
    try {
      const response = await fetch("/api/pipeline/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent, command: command.trim(), apiKey: requestKey }), signal: AbortSignal.timeout(95000) });
      const data = await response.json() as { result?: PipelineResult; error?: string };
      if (!response.ok) throw new Error(data.error || "เริ่มงานไม่สำเร็จ");
      setResult(data.result ?? null); setStatus("completed");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "เกิดข้อผิดพลาด กรุณาลองใหม่"); setStatus("failed");
    }
  }

  function reset() { timers.current.forEach((timer) => window.clearTimeout(timer)); setStatus("idle"); setResult(null); setError(""); setFeedback(""); setCommand(""); }
  async function copyResult() { if (!result) return; try { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setFeedback("คัดลอกผลลัพธ์แล้ว"); } catch { setFeedback("คัดลอกไม่ได้ กรุณาเลือกข้อความแล้วกด Ctrl+C"); } }
  function addSuggestedTask(item: PipelineResult["suggestedTasks"][number]) { const now = new Date().toISOString(); onCreateTask({ id: `pipeline-task-${crypto.randomUUID()}`, title: item.title, description: `Suggested by ${agentLabels[agent].name} agent.`, team: agentLabels[agent].team, assignedAgent: agentLabels[agent].assignedAgent, status: "Planned", priority: item.priority === "high" ? "High" : item.priority === "low" ? "Low" : "Medium", deadline: item.dueDate ?? "", createdAt: now, updatedAt: now }); setFeedback(`เพิ่ม ${item.title} เข้า Tasks แล้ว`); }

  return <section className="live-pipeline"><div className="live-pipeline-heading"><div><span className="eyebrow">LIVE AGENT RUN</span><h3>Start a focused run</h3><p>เลือก Agent ส่งคำสั่ง และติดตามงานแบบเรียลไทม์</p></div><span className={`live-run-status ${status}`}><i />{statusLabels[status]}</span></div><form className="live-pipeline-form" onSubmit={run}><label>Agent<select value={agent} onChange={(event) => setAgent(event.target.value as AgentId)} disabled={busy}>{(Object.keys(agentLabels) as AgentId[]).map((id) => <option key={id} value={id}>{agentLabels[id].name} · {agentLabels[id].description}</option>)}</select></label><label>คำสั่ง<textarea value={command} maxLength={4000} onChange={(event) => setCommand(event.target.value)} placeholder="เช่น ช่วยวางแผนปรับ CV ให้เสร็จภายใน 7 วัน" rows={4} disabled={busy} /></label><label>OpenAI API Key<div className="api-key-field"><input type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." autoComplete="off" disabled={busy} /><button type="button" className="icon-button" onClick={() => setShowKey((value) => !value)} disabled={busy} aria-label={showKey ? "ซ่อน API Key" : "แสดง API Key"}>{showKey ? "◉" : "◌"}</button></div></label><div className="live-pipeline-actions"><button className="primary-button" type="submit" disabled={busy || !command.trim() || !apiKey.trim()}>{busy ? "กำลังประมวลผล…" : "เริ่มงาน"}</button><small>API Key ใช้เฉพาะคำขอนี้ ไม่ถูกบันทึกถาวรหรือเก็บในประวัติ</small></div></form>{busy && <div className="live-pipeline-progress"><div className="live-agent-icon">{agentLabels[agent].icon}</div><div><strong>{agentLabels[agent].name} agent กำลังทำงาน</strong><p>{status === "queued" ? "กำลังเข้าคิวงาน…" : status === "analyzing" ? "กำลังวิเคราะห์คำสั่งและวางแผนขั้นตอน…" : "กำลังสร้างคำตอบตามบทบาทของ Agent…"}</p><div className="progress-dots"><i /><i /><i /></div></div><time>{startedAt && new Date(startedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time></div>}{status === "failed" && <div className="live-pipeline-error" role="alert"><strong>ทำงานไม่สำเร็จ</strong><span>{error}</span></div>}{status === "completed" && result && <div className="live-pipeline-result"><div className="result-heading"><div><span className="eyebrow">{agentLabels[agent].name.toUpperCase()} RESULT</span><h3>{result.summary}</h3></div><div><button className="secondary-button" onClick={() => void copyResult()}>คัดลอกผลลัพธ์</button><button className="secondary-button" onClick={reset}>เริ่มงานใหม่</button></div></div><div className="pipeline-output">{result.reply}</div><div className="live-result-steps">{result.steps.map((step) => <div key={`${step.title}-${step.description}`}><span className={step.status}>{step.status === "complete" ? "✓" : "○"}</span><div><strong>{step.title}</strong><p>{step.description}</p></div></div>)}</div>{result.suggestedTasks.length > 0 && <div className="suggested-tasks"><div className="result-subheading"><h4>Suggested tasks</h4><span>{result.suggestedTasks.length} งาน</span></div>{result.suggestedTasks.map((item) => <div className="suggested-task" key={`${item.title}-${item.dueDate}`}><div><strong>{item.title}</strong><small>{item.priority} priority{item.dueDate ? ` · Due ${item.dueDate}` : ""}</small></div><button className="secondary-button" onClick={() => addSuggestedTask(item)}>+ เพิ่มเข้า Tasks</button></div>)}</div>}{feedback && <p className="integration-feedback" role="status">{feedback}</p>}</div>}</section>;
}
