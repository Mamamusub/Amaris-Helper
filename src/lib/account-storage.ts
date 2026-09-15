import type { WorkspaceSync } from "./workspace-sync";
import { overlay, type CloudRecord } from "./workspace-model";

export type AppStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const documentId = (key: string, accountKey: string) => key.startsWith(`${accountKey}.`) ? key.slice(accountKey.length + 1) : key;
export function accountStorage(cloud: WorkspaceSync | null, local: AppStorage): AppStorage {
  if (!cloud) return local;
  return {
    getItem(key) {
      const row = documents(cloud).find(row => row.id === documentId(key, cloud.key));
      return typeof row?.data.value === "string" ? row.data.value : null;
    },
    setItem(key, value) {
      const id = documentId(key, cloud.key);
      if (!cloud.enqueue("document", [{ id, value }])) throw new Error("บันทึกข้อมูลเข้าคิวไม่สำเร็จ");
    },
    removeItem(key) {
      const id = documentId(key, cloud.key);
      if (!cloud.enqueue("document", [{ id, value: null }])) throw new Error("บันทึกการลบไม่สำเร็จ");
    },
  };
}
export function documents(cloud: WorkspaceSync) {
  const snapshot = cloud.getSnapshot();
  return overlay(snapshot.records, snapshot.pending).filter(row => row.kind === "document");
}
// Only account-owned legacy values migrate automatically. Guest data requires import.
export function legacyDocuments(storage: Pick<Storage, "key" | "length" | "getItem">, accountKey?: string): CloudRecord[] {
  const rows: CloudRecord[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)!;
    const accepted = accountKey
      ? key.startsWith(`${accountKey}.career.`) || key.startsWith(`${accountKey}.finance.v1`) || key === `${accountKey}.focus-session`
      : key.startsWith("amaris.career.") || key.startsWith("agent-helper.finance.v1") || ["amaris-exam-checklist", "amaris.exam.info", "amaris.exam.checklist", "agent-helper.hidden-nav", "agent-helper.build-lab"].includes(key);
    if (!accepted) continue;
    const id = accountKey ? documentId(key, accountKey) : key.replace(/^amaris\.career\./, "career.").replace(/^agent-helper\.finance/, "finance");
    const value = storage.getItem(key);
    if (value !== null) rows.push({ kind: "document", id, version: 0, data: { id, value } });
  }
  return rows;
}
