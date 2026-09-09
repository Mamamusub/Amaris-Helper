import { collection, materialize, overlay, type CloudRecord, type Kind, type Operation, type WorkspaceData } from "./workspace-model";
export type SyncStatus = "กำลังบันทึก" | "บันทึกแล้ว" | "ออฟไลน์" | "บันทึกไม่สำเร็จ" | "กำลังโหลด";
export type SyncSnapshot = { records: CloudRecord[]; data: WorkspaceData; pending: Operation[]; status: SyncStatus; error: string; conflict: boolean };
export class WorkspaceSync {
  readonly key: string;
  private listeners = new Set<() => void>();
  private active = false;
  private disposed = false;
  private snapshot: SyncSnapshot;
  constructor(readonly userId: string, private storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> & Partial<Pick<Storage, "length" | "key">>, private request: typeof fetch = fetch, private accountChanged: () => void = () => {}) {
    this.key = `amaris.account.${userId}`;
    const cached = storage.getItem(this.key);
    const initial = cached ? JSON.parse(cached) as { records: CloudRecord[]; pending: Operation[] } : { records: [], pending: [] };
    // Immutable per-operation journals prevent two tabs overwriting each other's outbox.
    if (storage.key && typeof storage.length === "number") {
      const pending = new Map(initial.pending.map((operation) => [operation.operationId, operation]));
      for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(`${this.key}.op.`)) { const operation = JSON.parse(storage.getItem(key)!) as Operation; pending.set(operation.operationId, operation); } }
      initial.pending = [...pending.values()];
    }
    this.snapshot = { ...initial, data: materialize(overlay(initial.records, initial.pending)), status: "กำลังโหลด", error: "", conflict: false };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(patch: Partial<SyncSnapshot>) {
    if (this.disposed) return;
    const next = { ...this.snapshot, ...patch };
    next.data = materialize(overlay(next.records, next.pending));
    // Journal before acknowledging an edit locally. Includes stable operation IDs.
    this.storage.setItem(this.key, JSON.stringify({ records: next.records, pending: next.pending }));
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
  private report(error: string, conflict = false) {
    this.snapshot = { ...this.snapshot, status: typeof navigator !== "undefined" && !navigator.onLine ? "ออฟไลน์" : "บันทึกไม่สำเร็จ", error, conflict };
    for (const listener of this.listeners) listener();
  }
  version(kind: Kind, id: string) { return overlay(this.snapshot.records, this.snapshot.pending).find((row) => row.kind === kind && row.id === id)?.version ?? 0; }
  enqueue(kind: Kind, value: Parameters<typeof collection>[1], expected?: Record<string, number>) {
    const current = overlay(this.snapshot.records, this.snapshot.pending);
    const changes = collection(kind, value).flatMap((data) => {
      const old = current.find((row) => row.kind === kind && row.id === data.id);
      return JSON.stringify(old?.data) === JSON.stringify(data) ? [] : [{ kind, id: data.id, data, version: expected?.[data.id] ?? old?.version ?? 0 }];
    });
    return this.queue({ operationId: crypto.randomUUID(), changes });
  }
  import(records: CloudRecord[]) { return this.queue({ operationId: crypto.randomUUID(), changes: records, importing: true }); }
  private queue(operation: Operation) {
    if (this.disposed) return false;
    if (!operation.changes.length) return true;
    try { this.storage.setItem(`${this.key}.op.${operation.operationId}`, JSON.stringify(operation)); this.publish({ pending: [...this.snapshot.pending, operation], status: typeof navigator !== "undefined" && !navigator.onLine ? "ออฟไลน์" : "กำลังบันทึก" }); }
    catch { this.report("เก็บแบบร่างในเครื่องไม่สำเร็จ กรุณาคัดลอกข้อความไว้และเพิ่มพื้นที่จัดเก็บ"); return false; }
    void this.sync(); return true;
  }
  async sync() {
    if (this.active || this.disposed) return;
    this.active = true;
    try {
      if (this.snapshot.conflict) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) { this.offline(); return; }
      if (this.snapshot.pending.length) this.publish({ status: "กำลังบันทึก", error: "" });
      while (true) {
        const operation = this.snapshot.pending[0];
        const response = await this.request("/api/workspace", operation ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation, userId: this.userId }), signal: AbortSignal.timeout(20000) } : { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (this.disposed) return;
        if (response.status === 401) { this.accountChanged(); return; }
        const body = await response.json();
        if (!response.ok) { this.report(body.error || "ซิงก์ไม่สำเร็จ กดลองใหม่", response.status === 409); return; }
        if (body.userId !== this.userId) { this.accountChanged(); return; }
        // A GET started before an edit must not consume that edit's queue entry.
        const pending = operation ? this.snapshot.pending.filter((item) => item.operationId !== operation.operationId) : this.snapshot.pending;
        this.publish({ records: body.records, pending, status: pending.length ? "กำลังบันทึก" : "บันทึกแล้ว", error: "", conflict: false });
        if (operation) this.storage.removeItem(`${this.key}.op.${operation.operationId}`);
        if (!pending.length) break;
      }
    } catch { if (!this.disposed) this.report("เชื่อมต่อไม่ได้ แบบร่างยังอยู่ในบัญชีนี้บนเครื่อง กดลองใหม่เมื่อออนไลน์"); }
    finally { this.active = false; }
  }
  async discardPending() {
    if (this.active) return false;
    try { for (const operation of this.snapshot.pending) this.storage.removeItem(`${this.key}.op.${operation.operationId}`); this.publish({ pending: [], conflict: false, error: "", status: "กำลังโหลด" }); await this.sync(); return true; }
    catch { this.report("ล้างคิวไม่สำเร็จ"); return false; }
  }
  offline() { this.snapshot = { ...this.snapshot, status: "ออฟไลน์" }; for (const listener of this.listeners) listener(); }
  dispose(clear = false) { this.disposed = true; if (clear) this.storage.removeItem(this.key); this.listeners.clear(); }
}
