"use client";
import { useRef, useState } from "react";
import { readStorage, storageKeys, writeStorage } from "@/lib/storage";
import { prepareChatGPTPrompt } from "@/lib/manual-pipeline";
import type { AgentRun, PipelineImage } from "@/lib/types";

export function usePipeline() {
  const [runs, setRuns] = useState<AgentRun[]>(() => readStorage<AgentRun[]>(storageKeys.runs, []));
  const current = useRef(runs);
  const [storageError, setStorageError] = useState("");
  function persist(next: AgentRun[]) {
    try { writeStorage(storageKeys.runs, next); }
    catch { setStorageError("บันทึกไม่ได้หรือพื้นที่เบราว์เซอร์เต็ม กรุณาคัดลอกข้อความเก็บไว้ หรือลดขนาดรูปแล้วลองใหม่"); return false; }
    current.current = next; setRuns(next); setStorageError(""); return true;
  }
  function start(request: string, images: PipelineImage[] = []) {
    if (!request.trim()) return false;
    const run: AgentRun = { id: `run-${crypto.randomUUID()}`, userRequest: request.trim(), images, createdAt: new Date().toISOString(), selectedAgents: ["secretary"], steps: [], finalResponse: "", status: "AwaitingResponse", provider: "ChatGPT · คัดลอกด้วยตนเอง", prompt: prepareChatGPTPrompt(request.trim(), images.map((image) => image.name)) };
    return persist([run, ...current.current]);
  }
  function saveResponse(id: string, response: string) {
    if (!response.trim()) return false;
    return persist(current.current.map((run) => run.id === id && run.prompt ? { ...run, finalResponse: response.trim(), status: "Complete", error: undefined } : run));
  }
  return { runs, storageError, start, saveResponse };
}
