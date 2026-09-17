"use client";
import { useContext, useState } from "react";
import type { Subject } from "@/lib/types";
import { useCloud } from "./account-boundary";
import { TaskContext } from "./task-controls";
export default function SubjectNotes({ subject, save, onDeleted }: { subject: Subject; save: (subject: Subject, version?: number) => boolean; onDeleted?: () => void }) {
  const cloud = useCloud();
  const { deleteSubject } = useContext(TaskContext);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [text, setText] = useState(subject.context);
  const [color, setColor] = useState(subject.color);
  const [version, setVersion] = useState(0);
  return <section className="subject-notes"><div className="subject-notes-heading"><h4>{subject.name}</h4><button type="button" className="subject-delete" aria-label={`ลบวิชา ${subject.name}`} onClick={() => { if (deleteSubject(subject.id)) onDeleted?.(); }}>ลบวิชา ×</button></div>{editing ? <form onSubmit={(event) => { event.preventDefault(); const trimmedName = name.trim(); if (!trimmedName) return; const next = { ...subject, name: trimmedName, context: text, color }; if (save(next, version)) setEditing(false); }}><label>ชื่อวิชา<input aria-label="ชื่อวิชา" value={name} onChange={(event) => setName(event.target.value)} /></label><label>สีวิชา<input aria-label="สีวิชา" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label>โน้ตรายวิชา<textarea aria-label="โน้ตรายวิชา" value={text} onChange={(event) => setText(event.target.value)} /></label><button className="secondary-button" type="submit">บันทึกวิชา</button><button className="text-button" type="button" onClick={() => setEditing(false)}>ยกเลิก</button></form> : <><p style={{ whiteSpace: "pre-wrap" }}>{subject.context || "ยังไม่มีโน้ต"}</p><button className="text-button" onClick={() => { setName(subject.name); setText(subject.context); setColor(subject.color); setVersion(cloud?.version("subject", subject.id) ?? 0); setEditing(true); }}>แก้ไขวิชา</button></>}</section>;
}
