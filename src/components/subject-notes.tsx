"use client";
import { useState } from "react";
import type { Subject } from "@/lib/types";
import { useCloud } from "./account-boundary";
export default function SubjectNotes({ subject, save }: { subject: Subject; save: (subject: Subject) => boolean }) {
  const cloud = useCloud();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(subject.context);
  const [version, setVersion] = useState(0);
  return <section className="subject-notes"><h4>โน้ตรายวิชา</h4>{editing ? <form onSubmit={(event) => { event.preventDefault(); const next = { ...subject, context: text }; if (cloud ? cloud.enqueue("subject", [next], { [subject.id]: version }) : save(next)) setEditing(false); }}><textarea aria-label="โน้ตรายวิชา" value={text} onChange={(event) => setText(event.target.value)} /><button className="secondary-button" type="submit">บันทึกโน้ต</button><button className="text-button" type="button" onClick={() => setEditing(false)}>ยกเลิก</button></form> : <><p style={{ whiteSpace: "pre-wrap" }}>{subject.context || "ยังไม่มีโน้ต"}</p><button className="text-button" onClick={() => { setText(subject.context); setVersion(cloud?.version("subject", subject.id) ?? 0); setEditing(true); }}>แก้ไขโน้ต</button></>}</section>;
}
