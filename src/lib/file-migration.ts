import type { WorkspaceSync } from "./workspace-sync";
import { documents } from "./account-storage";
import { fileRecordId, uploadAccountFile } from "./account-files";
import { listSubjectFiles, listSubjectFolders, saveSubjectFiles } from "./subject-files";
import { getFiles, saveFile } from "./standalone-exam-files";
import { getStoredFiles, saveStoredFile } from "./exam-files";

export async function syncLocalFiles(cloud: WorkspaceSync, cancelled: () => boolean = () => false, uploading: (name: string) => void = () => {}) {
  const known = new Set(documents(cloud).map(row => row.id));
  for (const [area, scope] of [["study", cloud.key], ["career", `${cloud.key}.career-files`]]) {
    const folders = await listSubjectFolders(scope);
    for (const item of folders) {
      if (cancelled()) return;
      const id = fileRecordId(area, item.id, "folder");
      if (!known.has(id) && !cloud.import([{ kind: "document", id, version: 0, data: { id, area, category: "folder", item } }])) throw new Error("ซิงก์โฟลเดอร์ไม่สำเร็จ");
    }
    for (const file of await listSubjectFiles(scope)) {
      if (cancelled()) return;
      if (known.has(fileRecordId(area, file.id))) continue;
      uploading(file.name);
      const uploaded = await uploadAccountFile(cloud, area, file, true);
      await saveSubjectFiles([uploaded]);
    }
  }
  for (const file of await getFiles(cloud.key)) {
    if (cancelled()) return;
    if (known.has(fileRecordId("exam-standalone", file.id))) continue;
    uploading(file.name);
    await saveFile(await uploadAccountFile(cloud, "exam-standalone", file, true));
  }
  for (const file of await getStoredFiles(cloud.key)) {
    if (cancelled()) return;
    if (known.has(fileRecordId("exam", file.id))) continue;
    uploading(file.name);
    await saveStoredFile(await uploadAccountFile(cloud, "exam", file, true));
  }
}

export async function importGuestFiles(cloud: WorkspaceSync) {
  // Copy; retain guest originals. Existing account/cloud IDs always win.
  const known = new Set(documents(cloud).map(row => row.id));
  for (const [area, from, to] of [["study", "local", cloud.key], ["career", "amaris.career-files", `${cloud.key}.career-files`]]) {
    const existing = new Set((await listSubjectFiles(to)).map(file => file.id));
    for (const file of await listSubjectFiles(from)) {
      const id = `import-${file.id}`;
      if (!existing.has(id) && !known.has(fileRecordId(area, id))) await saveSubjectFiles([{ ...file, id, scope: to, folderId: file.folderId ? `import-${file.folderId}` : null }]);
    }
    for (const folder of await listSubjectFolders(from)) {
      const item = { ...folder, id: `import-${folder.id}`, scope: to, parentId: folder.parentId ? `import-${folder.parentId}` : null };
      const id = fileRecordId(area, item.id, "folder");
      if (!known.has(id) && !cloud.enqueue("document", [{ id, area, category: "folder", item }])) throw new Error("นำเข้าโฟลเดอร์ไม่สำเร็จ");
    }
  }
  const standaloneExisting = new Set((await getFiles(cloud.key)).map(file => file.id));
  for (const file of await getFiles()) { const id = `import-${file.id}`; if (!standaloneExisting.has(id) && !known.has(fileRecordId("exam-standalone", id))) await saveFile({ ...file, id, scope: cloud.key }); }
  const existing = new Set((await getStoredFiles(cloud.key)).map(file => file.id));
  for (const file of await getStoredFiles()) {
    const id = `import-${file.id}`;
    if (!existing.has(id) && !known.has(fileRecordId("exam", id))) await saveStoredFile({ ...file, id, scope: cloud.key });
  }
}
