"use client";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { WorkspaceSync } from "@/lib/workspace-sync";
import { localImport } from "@/lib/workspace-model";
const CloudContext = createContext<WorkspaceSync | null>(null);
export const useCloud = () => useContext(CloudContext);
const noSubscribe = () => () => {};
const noSnapshot = () => null;
export function useCloudSnapshot() {
  const cloud = useCloud();
  return useSyncExternalStore(cloud?.subscribe ?? noSubscribe, cloud?.getSnapshot ?? noSnapshot, noSnapshot);
}
type Account = { id: string; email?: string };
export default function AccountBoundary({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");
  const [cloud, setCloud] = useState<WorkspaceSync | null>(null);
  const accountRef = useRef<string | null | undefined>(undefined);
  const cloudRef = useRef<WorkspaceSync | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error("ตรวจสอบบัญชีไม่ได้ กรุณาลองใหม่");
        const body = await response.json();
        if (!active) return;
        const id = body.user?.id ?? null;
        setConfigured(body.configured);
        if (id !== accountRef.current) {
          setAccount(undefined); setCloud(null);
          cloudRef.current?.dispose();
          const next = id ? new WorkspaceSync(id, localStorage, window.fetch.bind(window), () => { setAccount(undefined); void check(); }) : null;
          cloudRef.current = next; setCloud(next); setAccount(body.user); accountRef.current = id;
          if (next) void next.sync();
          const notification = new BroadcastChannel("amaris-auth"); notification.postMessage("changed"); notification.close();
        } else setAccount(body.user);
        setError("");
      } catch (problem) { if (active) setError(problem instanceof Error ? problem.message : "เชื่อมต่อไม่ได้"); }
      finally { checking = false; }
    };
    refreshRef.current = check;
    void check();
    const timer = setInterval(() => { void check(); }, 10000);
    const focus = () => { void check(); };
    const hidden = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", hidden);
    const channel = new BroadcastChannel("amaris-auth"); channel.onmessage = () => { setAccount(undefined); void check(); };
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", hidden); channel.close(); cloudRef.current?.dispose(); };
  }, []);
  async function login() {
    try { const response = await fetch("/api/auth/login", { method: "POST" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); location.assign(body.url); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "เข้าสู่ระบบไม่สำเร็จ"); }
  }
  async function logout() {
    if (cloud && (cloud.getSnapshot().pending.length || Object.keys(localStorage).some((key) => key.startsWith(`${cloud.key}.op.`)))) { setError("มีข้อมูลยังไม่ส่ง กรุณาลองซิงก์หรือส่งออกแบบร่างก่อนล้างคิว"); return; }
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) throw new Error("ออกจากระบบไม่สำเร็จ");
      cloud?.dispose(true); setAccount(undefined); accountRef.current = undefined; setCloud(null);
      const channel = new BroadcastChannel("amaris-auth"); channel.postMessage("changed"); channel.close();
      await refreshRef.current();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "ออกจากระบบไม่สำเร็จ"); }
  }
  return <CloudContext.Provider key={account?.id ?? (account === undefined ? "loading" : "local")} value={cloud}>
    <div className="account-bar"><span>{account === undefined ? "กำลังตรวจสอบบัญชี…" : account ? account.email : "Local · ข้อมูลอยู่ในเครื่อง"}</span>{account ? <button className="secondary-button" onClick={logout}>ออกจากระบบ</button> : account !== undefined && <button className="secondary-button" disabled={!configured} onClick={login}>เข้าสู่ระบบด้วย Google</button>}{!configured && account !== undefined && <small>ตั้งค่า Supabase เพื่อเปิดใช้ Login</small>}{error && <span role="alert">{error} <button onClick={() => void refreshRef.current()}>ลองใหม่</button></span>}</div>
    {account !== undefined && <>{cloud && <SyncBar cloud={cloud} />}{children}</>}
  </CloudContext.Provider>;
}
function SyncBar({ cloud }: { cloud: WorkspaceSync }) {
  const state = useSyncExternalStore(cloud.subscribe, cloud.getSnapshot, cloud.getSnapshot);
  const [importRecords] = useState(() => { try { return localImport(localStorage); } catch { return null; } });
  const [showImport, setShowImport] = useState(() => !localStorage.getItem(`amaris.import-choice.${cloud.userId}`));
  const [importQueued, setImportQueued] = useState(false);
  useEffect(() => {
    const retry = () => void cloud.sync();
    const offline = () => cloud.offline();
    const timer = setInterval(retry, 5000);
    window.addEventListener("offline", offline); window.addEventListener("online", retry); window.addEventListener("focus", retry);
    return () => { clearInterval(timer); window.removeEventListener("offline", offline); window.removeEventListener("online", retry); window.removeEventListener("focus", retry); };
  }, [cloud]);
  function exportDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "amaris-unsynced-draft.json"; a.click(); URL.revokeObjectURL(url);
  }
  return <div className="sync-bar">
    <span role="status">{state.status}{state.pending.length ? ` · ${state.pending.length} รายการรอส่ง` : ""}</span>
    {state.error && <span role="alert">{state.error}</span>}
    {!!state.pending.length && <details><summary>ดูรายการที่ยังไม่ส่ง</summary>{state.pending.flatMap((operation) => operation.changes.map((change) => <div key={`${operation.operationId}:${change.kind}:${change.id}`}><strong>{String(change.data.title ?? change.data.name ?? change.id)}</strong><pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>{JSON.stringify(change.data, null, 2)}</pre></div>))}</details>}
    <button className="text-button" onClick={() => void cloud.sync(true)}>ลองใหม่ / โหลดล่าสุด</button>
    {!!state.pending.length && <><button className="text-button" onClick={exportDraft}>ส่งออกแบบร่าง</button><button className="text-button" onClick={() => { exportDraft(); void cloud.discardPending(); }}>ส่งออกและทิ้งการแก้ไขที่ยังไม่ส่ง ใช้ข้อมูลเซิร์ฟเวอร์</button></>}
    {importRecords === null && <span role="alert">อ่านข้อมูล Local ไม่สำเร็จ ต้นฉบับยังอยู่ในเครื่อง</span>}
    {!!importRecords?.length && (showImport ? <div><strong>พบข้อมูลในเครื่อง: {importRecords.filter((r) => r.kind === "task").length} งาน · {importRecords.filter((r) => r.kind === "subject").length} วิชา · {importRecords.filter((r) => r.kind === "thread").length} ชุดโน้ต/บทสนทนา · {importRecords.filter((r) => r.kind === "run").length} Pipeline</strong><button className="secondary-button" disabled={importQueued || !!state.pending.length || state.status !== "บันทึกแล้ว"} onClick={() => { if (cloud.import(importRecords)) setImportQueued(true); }}>นำข้อมูลในเครื่องเข้าบัญชี</button><button className="text-button" onClick={() => { localStorage.setItem(`amaris.import-choice.${cloud.userId}`, "skip"); setShowImport(false); }}>ข้ามก่อน</button>{importQueued && state.pending.length === 0 && state.status === "บันทึกแล้ว" && <span>นำเข้าสำเร็จแล้ว ต้นฉบับ Local ยังอยู่</span>}</div> : <button className="text-button" onClick={() => setShowImport(true)}>นำเข้าข้อมูล Local</button>)}
  </div>;
}
