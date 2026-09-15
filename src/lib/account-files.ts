import type { WorkspaceSync } from "./workspace-sync";
import { documents } from "./account-storage";

export type AccountFile = { id: string; name: string; size: number; createdAt: string; blob: Blob; remotePath?: string; ownerId?: string; cloudVersion?: number };
export function fileRecords<T>(cloud: WorkspaceSync, area: string, category = "file"): T[] {
  return documents(cloud).filter(row => row.data.area === area && row.data.category === category && !row.data.deletedAt).map(row => ({ ...(row.data.item as object), cloudVersion: row.version }) as T);
}
export function fileRecordId(area: string, id: string, category = "file") { return `${category}:${area}:${id}`; }
async function performUpload<T extends AccountFile>(cloud: WorkspaceSync, area: string, file: T, importing = false): Promise<T> {
  let next = file;
  if (!file.remotePath) {
    const response = await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: cloud.userId, size: file.size }), signal: AbortSignal.timeout(20000) });
    const signed = await response.json();
    if (!response.ok) throw new Error(signed.error || "ขออัปโหลดไม่สำเร็จ");
    if (signed.userId !== cloud.userId) throw new Error("บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่");
    const upload = await fetch(signed.signedUrl, { method: "PUT", headers: { "Content-Type": file.blob.type || "application/octet-stream" }, body: file.blob, signal: AbortSignal.timeout(120000) });
    if (!upload.ok) throw new Error("อัปโหลดไม่สำเร็จ ต้นฉบับยังอยู่ในเครื่อง กดลองใหม่");
    next = { ...file, remotePath: signed.path, ownerId: cloud.userId };
  }
  const { blob: _blob, cloudVersion, ...item } = next;
  void _blob;
  const id = fileRecordId(area, file.id);
  const data = { id, area, category: "file", item };
  const saved = importing ? cloud.import([{ kind: "document", id, data, version: 0 }]) : cloud.enqueue("document", [data], cloudVersion === undefined ? undefined : { [id]: cloudVersion });
  if (!saved) throw new Error("ไฟล์อัปโหลดแล้ว แต่ยังบันทึกประวัติไม่สำเร็จ กดลองใหม่");
  return next;
}
export function accountFileBlob(file: AccountFile): Promise<Blob> {
  if (file.blob?.size) return Promise.resolve(file.blob);
  return (async () => {
    if (!file.remotePath || !file.ownerId) throw new Error("ไม่พบไฟล์");
    const response = await fetch(`/api/files?${new URLSearchParams({ path: file.remotePath, userId: file.ownerId })}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    const signed = await response.json();
    if (!response.ok) throw new Error(signed.error || "โหลดไฟล์ไม่สำเร็จ");
    const download = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(120000) });
    if (!download.ok) throw new Error("โหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    return download.blob();
  })();
}

const uploads = new WeakMap<WorkspaceSync, Map<string, Promise<AccountFile>>>();
export async function uploadAccountFile<T extends AccountFile>(cloud: WorkspaceSync, area: string, file: T, importing = false): Promise<T> {
  let active = uploads.get(cloud);
  if (!active) { active = new Map(); uploads.set(cloud, active); }
  const key = fileRecordId(area, file.id);
  if (active.has(key)) throw new Error("ไฟล์นี้กำลังอัปโหลด กรุณารอแล้วลองใหม่");
  const upload = performUpload(cloud, area, file, importing);
  active.set(key, upload);
  try { return await upload; } finally { active.delete(key); }
}
