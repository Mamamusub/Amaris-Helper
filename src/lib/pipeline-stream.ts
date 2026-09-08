import type { PipelineUpdate } from "./types";

export async function consumePipeline(response: Response, receive: (update: PipelineUpdate) => void) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "เริ่ม Pipeline ไม่สำเร็จ");
  }
  if (!response.body) throw new Error("ไม่พบข้อมูลตอบกลับจาก Pipeline");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  function process(line: string) {
    if (!line.trim()) return;
    const update = JSON.parse(line) as PipelineUpdate;
    if (!Array.isArray(update.steps) || !Array.isArray(update.selectedAgents) || !["Running", "Complete", "Failed", "Cancelled"].includes(update.status ?? "")) throw new Error("ข้อมูลตอบกลับจาก Pipeline ไม่ถูกต้อง");
    terminal = update.status !== "Running";
    receive(update);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) { process(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
      if (done) break;
    }
    process(buffer);
    if (!terminal) throw new Error("การเชื่อมต่อขาดก่อนงานเสร็จ กดเริ่มใหม่เพื่อทำงานอีกครั้ง");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
