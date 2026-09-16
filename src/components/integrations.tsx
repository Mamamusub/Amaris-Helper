"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/types";

type Status = { google: { configured: boolean; connected: boolean; email?: string; classroom?: boolean } };

async function post(path: string, body?: unknown) {
  const response = await fetch(`/api/integrations/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Connection failed. Please try again.");
  return data as { message: string; url?: string };
}

export function TaskIntegrations({ task }: { task: Task }) {
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState("");
  if (task.sourceEventId) return <div className="task-integrations"><p className="integration-feedback">Assigned from Google Calendar · local task copy</p></div>;
  async function send(service: "google/events") {
    if (pending) return;
    setPending(service); setResult("");
    try {
      const { id, title, description, deadline, team, priority } = task;
      const data = await post(service, { id, title, description, deadline, team, priority });
      setResult(data.message);
    } catch (error) { setResult(error instanceof Error ? error.message : "Could not send task."); }
    finally { setPending(null); }
  }
  return <div className="task-integrations">
    <div className="integration-actions">
      <button className="secondary-button" disabled={Boolean(pending)} onClick={() => send("google/events")} aria-label={`Add ${task.title} to Google Calendar`}>{pending === "google/events" ? "Adding…" : "+ Google Calendar"}</button>
    </div>
    {result && <p className="integration-feedback" role="status">{result}</p>}
  </div>;
}

export function IntegrationSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [primaryEmail, setPrimaryEmail] = useState("");
  async function refresh() {
    const response = await fetch("/api/integrations/status", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load connection status.");
    setLoadError(""); setStatus(data);
  }
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/integrations/status", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load connection status.");
      const data: Status = body;
      if (active) setStatus(data);
    }).catch(() => { if (active) setLoadError("ตรวจสถานะไม่สำเร็จ กรุณาตรวจว่าเซิร์ฟเวอร์เว็บยังทำงานอยู่ แล้วลองอีกครั้ง"); });
    fetch("/api/auth/session", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(data => { if (active && data?.user?.email) setPrimaryEmail(data.user.email); }).catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [attempt]);
  async function connect() {
    setPending(true); setMessage("");
    try {
      const data = await post("google/connect");
      if (!data.url) throw new Error("Could not start Google sign-in.");
      window.location.assign(data.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect."); setPending(false); }
  }
  async function disconnect() {
    setPending(true);
    try { const data = await post("google/disconnect"); setMessage(data.message); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not disconnect."); }
    finally { setPending(false); }
  }
  return <section className="integration-settings">
    <div className="panel-heading"><div><span className="eyebrow">CONNECTED APPS</span><h3>Your Google Calendar</h3></div></div>
    <div className="integration-card"><div><h4>Google Calendar + Classroom</h4><p>อ่าน assignment จาก Google Classroom และกิจกรรม Google Calendar ด้วยบัญชี Google แยกจากบัญชีเข้า Amaris การเชื่อมนี้อ่านอย่างเดียวและไม่เปลี่ยน Tasks หรือการส่งงานไป Calendar</p><small>{loadError ? "ตรวจสถานะไม่สำเร็จ" : !status ? "กำลังตรวจการตั้งค่า…" : status.google.connected ? `แหล่งข้อมูล: ${status.google.email || "บัญชี Google ที่เชื่อมต่อ"}${status.google.classroom === false ? " · Classroom ยังไม่ได้รับสิทธิ์" : ""}` : status.google.configured ? "Ready to connect" : "ยังตั้งค่า Google OAuth ไม่ครบ — ต้องตั้งค่าก่อนเชื่อมบัญชี"}</small></div>
      {loadError ? <button className="secondary-button" onClick={() => { setLoadError(""); setAttempt((value) => value + 1); }}>ลองอีกครั้ง</button> : !status ? <button className="primary-button" disabled>กำลังตรวจการตั้งค่า…</button> : !status.google.configured ? <button className="primary-button" aria-expanded={showSetup} aria-controls="google-setup" onClick={() => setShowSetup((value) => !value)}>ตั้งค่า Google Calendar</button> : status.google.connected ? <button className="secondary-button" disabled={pending} onClick={disconnect}>{pending ? "กำลังยกเลิก…" : "ยกเลิกการเชื่อมต่อ"}</button> : <button className="primary-button" disabled={pending} onClick={connect}>{pending ? "กำลังเชื่อมต่อ…" : "เชื่อมบัญชี Google สำหรับข้อมูล"}</button>}
    </div>
    <div className="integration-card"><div><h4>บัญชี</h4><p>บัญชีหลักสำหรับเข้า Amaris และเป็นเจ้าของ Tasks/ข้อมูลเดิม</p><small>{primaryEmail || "ตรวจจากเซสชันที่เข้าสู่ระบบ"}</small></div>{status?.google.connected && <button className="secondary-button" disabled={pending} onClick={connect}>{pending ? "กำลังเปิด Google…" : "เปลี่ยนบัญชีแหล่งข้อมูล"}</button>}</div>
    {status?.google.connected && status.google.email && <div className="integration-card"><div><h4>Gmail สำหรับ Calendar/Classroom</h4><p>บัญชีนี้ใช้ดึง Calendar และ assignment เท่านั้น ไม่ใช่บัญชีเข้า Amaris</p><input type="email" value={status.google.email} readOnly aria-label="Gmail สำหรับ Calendar และ Classroom" /></div></div>}
    {loadError && <p className="integration-feedback" role="alert">{loadError}</p>}
    {showSetup && <div id="google-setup" className="google-setup" lang="th">
      <h4>ตั้งค่าครั้งแรกเพื่อเชื่อมบัญชี Google</h4>
      <ol>
        <li>เปิด Google Classroom API ใน Google Cloud โปรเจกต์เดียวกัน และเพิ่มเฉพาะ classroom.courses.readonly, classroom.coursework.me.readonly และ userinfo.email ใน OAuth consent screen</li>
        <li>เปิด <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Cloud → Google Calendar API</a> เลือกหรือสร้างโปรเจกต์ แล้วกด Enable</li>
        <li>ตั้งค่า OAuth consent screen และเพิ่มอีเมลโรงเรียน/บัญชีข้อมูลเป็น Test user จากนั้นสร้าง OAuth Client แบบ Web application</li>
        <li>เพิ่ม Authorized redirect URI เป็น URL เดียวกับที่เปิดเว็บอยู่ ตามด้วย <code>/api/integrations/google/callback</code> เช่น <code>https://your-ngrok-domain.ngrok-free.dev/api/integrations/google/callback</code></li>
        <li>เปิดไฟล์ <code>.env.local</code> ในโปรเจกต์ ใส่ <code>GOOGLE_CLIENT_ID</code> และ <code>GOOGLE_CLIENT_SECRET</code> ที่ได้จาก Google และตั้ง <code>INTEGRATION_SECRET</code> เป็นค่าสุ่มอย่างน้อย 32 ตัวอักษรตาม README</li>
        <li>หยุดเซิร์ฟเวอร์ด้วย Ctrl+C แล้วรัน <code>npm run dev</code> ใหม่ กลับมาหน้านี้และกดตรวจการตั้งค่าอีกครั้ง</li>
      </ol>
      <p>ถ้าเปิดผ่าน ngrok หรือ production ให้ลงทะเบียน Redirect URI ของโดเมนนั้นใน Google Cloud ระบบจะใช้ host ของ request ปัจจุบันสำหรับ OAuth และยังรองรับ APP_ORIGIN เป็นค่า trusted origin สำรอง เก็บค่าลับในไฟล์ .env.local เท่านั้น</p>
      <button className="secondary-button" onClick={() => { setStatus(null); setLoadError(""); setAttempt((value) => value + 1); }}>ตรวจการตั้งค่าอีกครั้ง</button>
    </div>}
    <div className="integration-actions">{status?.google.connected && <button className="secondary-button" disabled={pending} onClick={connect}>อัปเดตสิทธิ์อ่าน Calendar/Classroom</button>}</div>
    <p className="integration-feedback">การเปลี่ยนหรือยกเลิก source จะล้าง connection ฝั่ง Calendar/Classroom ทันที แต่ไม่ลบ Tasks เดิม การเชื่อมนี้ไม่ให้สิทธิ์ Sheets และไม่ใช้สำหรับส่งงานเข้า Google Calendar เดิม</p>
    <p className="integration-feedback">Open Calendar to see your events and task deadlines together. Refresh to load Google changes; assigned tasks are saved as local copies.</p>
    {message && <p className="integration-feedback" role="status">{message}</p>}
  </section>;
}

export function CalendarReturnNotice({ onSettings }: { onSettings: () => void }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("calendar");
    if (!outcome) return;
    // Defer the external navigation result until the page has hydrated.
    const timer = window.setTimeout(() => {
      const reason = url.searchParams.get("calendar_error");
      const detail = reason === "database" ? "บันทึกการเชื่อมต่อไม่สำเร็จ ตรวจ Supabase RPC และ migration" : reason === "google-email" ? "ระบุอีเมลบัญชี Google ไม่สำเร็จ ตรวจ scope userinfo.email" : reason === "scopes" ? "สิทธิ์ Google ไม่ครบ ตรวจ OAuth consent screen" : reason === "refresh-token" ? "Google ไม่ส่ง refresh token กลับมา ให้เลือกบัญชีใหม่และอนุญาตอีกครั้ง" : reason === "amaris-session" || reason === "account-changed" ? "เซสชัน Amaris เปลี่ยนระหว่างอนุญาต กรุณาเข้าสู่ระบบใหม่" : reason === "state" ? "OAuth state ไม่ตรงกัน กรุณาเริ่มเชื่อมต่อใหม่" : "ตรวจ Google OAuth และลองใหม่";
      setMessage(outcome === "connected" ? "Google Calendar connected. Open Calendar to view your deadlines." : outcome === "cancelled" ? "Google sign-in was cancelled." : `เชื่อม Google ไม่สำเร็จ: ${detail}`);
      url.searchParams.delete("calendar");
      url.searchParams.delete("calendar_error");
      window.history.replaceState(null, "", url);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return message ? <div className="integration-return" role="status"><span>{message}</span><button className="secondary-button" onClick={onSettings}>Settings</button><button className="secondary-button" onClick={() => setMessage("")} aria-label="Dismiss connection message">×</button></div> : null;
}
