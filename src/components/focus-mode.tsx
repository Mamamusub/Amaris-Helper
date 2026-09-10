"use client";
import { useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/types";
import { elapsed, finish, formatTime, focusedToday, pause, type FocusSession } from "@/lib/focus-timer";
import { dayKey } from "@/lib/calendar";
import { Subtasks } from "./task-extras";
import { dialogKeyboard } from "./dialog-keyboard";

export default function FocusMode({ taskId, tasks, accountKey, open, close, save }: { taskId: string | null; tasks: Task[]; accountKey: string; open: (id: string) => void; close: () => void; save: (id: string, patch: Partial<Task>) => boolean }) {
  const key = `${accountKey}.focus-session`;
  const read = (): FocusSession | null => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; };
  const [session, setSession] = useState<FocusSession | null>(() => { try { return read(); } catch { return null; } });
  const [now, setNow] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(25);
  const [error, setError] = useState("");
  const latest = useRef({ tasks, save });
  useEffect(() => { latest.current = { tasks, save }; }, [tasks, save]);
  async function mutate(change: (current: FocusSession | null) => FocusSession | null) {
    try {
      if (!navigator.locks) throw new Error("เบราว์เซอร์นี้ไม่รองรับการล็อกหลายแท็บ กรุณาใช้ Chrome, Edge หรือ Safari รุ่นใหม่");
      await navigator.locks.request(key, () => { const current = read(); const next = session && current?.id !== session.id ? current : change(current); localStorage.setItem(key, JSON.stringify(next)); setSession(next); });
      setError("");
    } catch (problem) { setError(problem instanceof Error ? problem.message : "บันทึกไม่ได้ กรุณาลองใหม่"); }
  }
  useEffect(() => {
    const refresh = () => { setNow(Date.now()); try { const raw = localStorage.getItem(key); setSession(raw ? JSON.parse(raw) : null); } catch { setError("อ่านตัวจับเวลาไม่ได้ กรุณาตรวจพื้นที่จัดเก็บแล้วลองใหม่"); } };
    const timer = setInterval(refresh, 500);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
  }, [key]);
  useEffect(() => {
    if (!session || session.endedAt || session.runningSince === null || elapsed(session, now) < session.durationMs) return;
    void navigator.locks?.request(key, () => {
      const raw = localStorage.getItem(key); const current: FocusSession | null = raw ? JSON.parse(raw) : null;
      if (current && !current.endedAt && elapsed(current, Date.now()) >= current.durationMs) { const ended = finish(current, Date.now()); localStorage.setItem(key, JSON.stringify(ended)); setSession(ended); }
    }).catch(() => setError("บันทึกเวลาจบไม่สำเร็จ กดจบรอบเพื่อลองใหม่"));
  }, [session, now, key]);
  useEffect(() => {
    if (!session?.endedAt) return;
    const task = latest.current.tasks.find((item) => item.id === session.taskId);
    if (!task || task.focusSessions?.some((item) => item.id === session.id)) return;
    if (!latest.current.save(task.id, { focusSessions: [...(task.focusSessions ?? []), { id: session.id, startedAt: session.startedAt, endedAt: session.endedAt, elapsedMs: session.elapsedMs, note: session.note, intervals: session.intervals }] })) setError("ประวัติยังบันทึกไม่ได้ เวลายังอยู่ในเครื่อง กดลองใหม่");
  }, [session, tasks]);
  const task = tasks.find((item) => item.id === taskId);
  const activeTask = tasks.find((item) => item.id === session?.taskId);
  const current = session && session.taskId === taskId ? session : null;
  const total = tasks.flatMap((item) => item.focusSessions ?? []).reduce((sum, item) => sum + (item.intervals ? focusedToday(item.intervals, dayKey(new Date(now))) : dayKey(new Date(item.endedAt)) === dayKey(new Date(now)) ? item.elapsedMs : 0), 0);
  const isSaved = !session?.endedAt || !!activeTask?.focusSessions?.some((item) => item.id === session.id);
  const clear = () => { if (isSaved) void mutate(() => null); };
  if (!task) return <>{error && <div className="notice" role="alert">{error}</div>}{session && <button className="focus-mini" onClick={() => open(session.taskId)}><span>{session.endedAt ? "✓ จบรอบแล้ว" : session.runningSince === null ? "Ⅱ หยุดพัก" : "◷ กำลังโฟกัส"}</span><strong>{activeTask?.title ?? "งานที่เลือก"}</strong><b>{formatTime(session.durationMs - elapsed(session, now))}</b></button>}</>;
  return <div className="workspace-overlay focus-overlay" role="dialog" aria-modal="true" aria-label="โฟกัสกับงาน" onKeyDown={(event) => dialogKeyboard(event, close)}><section className="focus-panel">
    <div className="panel-heading"><span className="eyebrow">FOCUS · วันนี้ {formatTime(total)}</span><button autoFocus className="close-button" aria-label="ย่อหน้าต่างโฟกัส" onClick={close}>×</button></div>
    <h2>{task.title}</h2><p className="muted">ทีละขั้นตอน ให้เวลากับงานตรงหน้า</p>
    {error && <p role="alert">{error} <button className="secondary-button" onClick={() => void mutate((value) => value)}>ลองใหม่</button></p>}
    {session && !current ? <div className="empty-state"><p>มีรอบของ “{activeTask?.title}” อยู่แล้ว</p><button className="primary-button" onClick={() => open(session.taskId)}>กลับไปรอบเดิม</button></div> : <>
      <div className="focus-clock" role="timer" aria-label="เวลาที่เหลือ">{formatTime(current ? current.durationMs - elapsed(current, now) : minutes * 60000)}</div>
      <p className="focus-status" role="status">{current?.endedAt ? `จบรอบ · โฟกัสจริง ${formatTime(current.elapsedMs)}` : current ? current.runningSince === null ? "หยุดพัก · ไม่นับเวลา" : "กำลังโฟกัส" : "พร้อมเมื่อคุณพร้อม"}</p>
      {!current && <><div className="focus-presets">{[25, 50].map((value) => <button className="secondary-button" key={value} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{value} นาที</button>)}<label>กำหนดเอง (นาที)<input type="number" min="1" max="240" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label></div><button className="primary-button" disabled={!Number.isFinite(minutes) || minutes < 1 || minutes > 240} onClick={() => void mutate((existing) => existing ?? { id: crypto.randomUUID(), taskId: task.id, startedAt: Date.now(), runningSince: Date.now(), elapsedMs: 0, durationMs: minutes * 60000, note: "" })}>เริ่มโฟกัส</button></>}
      {current && !current.endedAt && <><div className="focus-actions"><button className="primary-button" onClick={() => void mutate((value) => value && !value.endedAt ? value.runningSince === null ? { ...value, runningSince: Date.now() } : elapsed(value, Date.now()) >= value.durationMs ? finish(value, Date.now()) : pause(value, Date.now()) : value)}>{current.runningSince === null ? "ทำต่อ" : "หยุดพัก"}</button><button className="secondary-button" onClick={() => void mutate((value) => value ? finish(value, Date.now()) : value)}>จบรอบ</button></div><label className="focus-note">สิ่งที่ทำต่อ<textarea value={current.note} placeholder="จดขั้นตอนถัดไป เพื่อกลับมาเริ่มได้ง่าย" onChange={(event) => { const note = event.target.value; void mutate((value) => value && !value.endedAt ? { ...value, note } : value); }} /></label></>}
      {current?.endedAt && <div className="session-summary"><p>{current.note || "ยังไม่ได้จดสิ่งที่ทำต่อ"}</p><p role="status">{isSaved ? "บันทึกประวัติแล้ว" : "กำลังบันทึกประวัติ…"}</p><div className="focus-actions"><button disabled={!isSaved} className="primary-button" onClick={clear}>ทำต่ออีกรอบ</button><button disabled={!isSaved} className="secondary-button" onClick={() => { clear(); close(); }}>พัก</button><button disabled={!isSaved || task.status === "Done"} className="secondary-button" onClick={() => { if (save(task.id, { status: "Done" })) { clear(); close(); } }}>งานเสร็จแล้ว</button></div></div>}
    </>}
    <Subtasks items={task.subtasks} onChange={(subtasks) => save(task.id, { subtasks })} />
    {!!task.subtasks?.length && task.subtasks.every((item) => item.done) && task.status !== "Done" && <button className="secondary-button" onClick={() => save(task.id, { status: "Done" })}>งานย่อยครบแล้ว · ปิดงานหลัก</button>}
    <details className="focus-history"><summary>ประวัติโฟกัส · {task.focusSessions?.length ?? 0} รอบ</summary>{!task.focusSessions?.length && <p className="muted">จบรอบแรกเพื่อเริ่มเก็บเวลา</p>}{task.focusSessions?.slice().reverse().map((item) => <div key={item.id}><strong>{formatTime(item.elapsedMs)}</strong> · {new Date(item.endedAt).toLocaleString("th-TH")}<p>{item.note}</p></div>)}</details>
  </section></div>;
}
