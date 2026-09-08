"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { PipelineImage } from "@/lib/types";

export function PipelineComposer({ onRoute, disabled = false }: { onRoute: (request: string, images?: PipelineImage[]) => boolean; disabled?: boolean }) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<PipelineImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const reading = useRef(false);

  async function attach(files: File[]) {
    if (reading.current || !files.length) return;
    setError("");
    if (images.length + files.length > 3) { setError("แนบได้สูงสุด 3 รูปต่อคำสั่ง"); return; }
    if (files.some((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type))) { setError("รองรับไฟล์ PNG, JPG และ WebP เท่านั้น"); return; }
    if (files.some((file) => file.size > 1024 * 1024) || [...files, ...images].reduce((total, file) => total + file.size, 0) > 2 * 1024 * 1024) { setError("แต่ละรูปต้องไม่เกิน 1 MB และรวมกันไม่เกิน 2 MB"); return; }
    reading.current = true; setBusy(true);
    try {
      const attachments = await Promise.all(files.map(async (file) => {
        // Decode before accepting so renamed or damaged files cannot become broken previews.
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("read failed"));
          reader.onabort = () => reject(new Error("read aborted"));
          reader.readAsDataURL(file);
        });
        return { id: crypto.randomUUID(), name: file.name, dataUrl, size: file.size };
      }));
      setImages((current) => [...current, ...attachments]);
    } catch { setError("อ่านรูปไม่สำเร็จ ลองเลือกไฟล์รูปอื่น"); }
    finally { reading.current = false; setBusy(false); }
  }

  return <form className="pipeline-composer" onSubmit={(event) => {
    event.preventDefault();
    if (busy || disabled || (!text.trim() && !images.length)) return;
    if (onRoute(text.trim() || "รูปภาพที่แนบมา", images)) { setText(""); setImages([]); setError(""); }
    else setError("ยังส่งไม่ได้ รูปและข้อความยังอยู่ กรุณาตรวจข้อความแจ้งด้านล่าง");
  }}>
    <label htmlFor="pipeline-request">เตรียมคำสั่งสำหรับ ChatGPT</label>
    <textarea id="pipeline-request" value={text} maxLength={4000} onChange={(event) => setText(event.target.value)} placeholder="พิมพ์คำสั่ง หรือแนบรูปที่อยากให้ผู้ช่วยดู…" rows={3} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void attach(files); } }} />
    <PipelineImages images={images} onRemove={busy ? undefined : (id) => setImages((current) => current.filter((image) => image.id !== id))} />
    <div className="pipeline-composer-actions"><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { void attach(Array.from(event.target.files ?? [])); event.target.value = ""; }} /><button type="button" className="secondary-button" disabled={busy || images.length >= 3} onClick={() => input.current?.click()}>{busy ? "กำลังอ่านรูป…" : "+ แนบรูป"}</button><small>{images.length}/3 รูป · รูปละ 1 MB · รวม 2 MB</small><button type="submit" className="primary-button" disabled={disabled || busy || (!text.trim() && !images.length)}>ส่งคำสั่ง ↗</button></div>
    {error && <p className="pipeline-upload-error" role="alert">{error}</p>}
    <p className="pipeline-image-note">วางรูปด้วย Ctrl+V ได้ · Shift+Enter ขึ้นบรรทัดใหม่ · รูปเก็บในเบราว์เซอร์และต้องแนบใน ChatGPT เอง</p>
  </form>;
}

export function PipelineImages({ images, onRemove }: { images: PipelineImage[]; onRemove?: (id: string) => void }) {
  const [selected, setSelected] = useState<PipelineImage | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    {images.length > 0 && <div className="pipeline-images">{images.map((image) => <div className="pipeline-image" key={image.id}><button type="button" className="pipeline-image-preview" onClick={() => { setSelected(image); dialog.current?.showModal(); }} aria-label={`ดูรูป ${image.name}`}><Image src={image.dataUrl} alt={image.name} width={110} height={82} unoptimized /><span>{image.name}</span></button>{onRemove && <button type="button" className="pipeline-image-remove" aria-label={`ลบรูป ${image.name}`} onClick={() => onRemove(image.id)}>×</button>}</div>)}</div>}
    <dialog ref={dialog} className="pipeline-image-dialog" onClose={() => setSelected(null)} aria-label="ภาพแนบ"><button type="button" className="secondary-button" onClick={() => dialog.current?.close()}>ปิด ×</button>{selected && <><Image src={selected.dataUrl} alt={selected.name} width={1200} height={900} unoptimized /><p>{selected.name}</p></>}</dialog>
  </>;
}
