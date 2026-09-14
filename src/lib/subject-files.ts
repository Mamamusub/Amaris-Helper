export type SubjectFile = { id: string; scope: string; subjectId: string; subjectName: string; name: string; kind: "pdf" | "png"; size: number; createdAt: string; blob: Blob };

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("amaris-subject-files", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("files", { keyPath: "id" }).createIndex("scope", "scope"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("เปิดพื้นที่เก็บไฟล์ไม่ได้ กรุณาตรวจการตั้งค่าเบราว์เซอร์"));
    request.onblocked = () => reject(new Error("กรุณาปิดแท็บอื่นของแอปแล้วลองใหม่"));
  });
}
export async function listSubjectFiles(scope: string): Promise<SubjectFile[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const request = tx.objectStore("files").index("scope").getAll(scope);
    tx.oncomplete = () => resolve(request.result as SubjectFile[]);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function saveSubjectFiles(files: SubjectFile[]) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    for (const file of files) tx.objectStore("files").put(file);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new Error("บันทึกไฟล์ไม่สำเร็จ พื้นที่จัดเก็บอาจเต็ม"));
    tx.onerror = () => reject(new Error("บันทึกไฟล์ไม่สำเร็จ พื้นที่จัดเก็บอาจเต็ม"));
  }); } finally { db.close(); }
}
export async function fileKind(file: Blob): Promise<"pdf" | "png"> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if ([137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return "png";
  if ([37,80,68,70,45].every((n, i) => bytes[i] === n)) return "pdf";
  throw new Error("รองรับเฉพาะไฟล์ PDF และ PNG ที่ถูกต้อง");
}
export async function fileAsPdf(file: Pick<SubjectFile, "kind" | "blob">): Promise<Blob> {
  if (file.kind === "pdf") return new Blob([file.blob], { type: "application/pdf" });
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(await file.blob.arrayBuffer());
  const landscape = png.width > png.height;
  const page = doc.addPage(landscape ? [841.89, 595.28] : [595.28, 841.89]);
  const scale = Math.min((page.getWidth() - 48) / png.width, (page.getHeight() - 48) / png.height);
  const width = png.width * scale, height = png.height * scale;
  page.drawImage(png, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  return new Blob([new Uint8Array(await doc.save())], { type: "application/pdf" });
}
