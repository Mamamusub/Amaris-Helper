import type { PipelineImage } from "./types";

export type GenerateInput = { systemPrompt: string; message: string; context?: string; images?: PipelineImage[]; signal?: AbortSignal; schema?: Record<string, unknown> };
export type AIProvider = { name: string; generate(input: GenerateInput): Promise<string> };
export class AIError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
function apiKey() {
  return process.env.OPENAI_API_KEY?.trim() || process.env.AI_API_KEY?.trim() || "";
}
export function aiConfiguration() {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "openai";
  return { provider, model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini", configured: Boolean(apiKey()) && provider === "openai" };
}
export function getAIProvider(): AIProvider {
  const config = aiConfiguration();
  if (config.provider !== "openai") throw new AIError("ตั้ง AI_PROVIDER=openai ใน .env.local แล้วรีสตาร์ตเซิร์ฟเวอร์ก่อนใช้งาน AI", 503);
  if (!config.configured) throw new AIError("ไม่พบ API key บนเซิร์ฟเวอร์ ตั้ง OPENAI_API_KEY หรือ AI_API_KEY ใน .env.local แล้วรีสตาร์ตเซิร์ฟเวอร์", 503);
  return {
    name: `OpenAI · ${config.model}`,
    async generate({ systemPrompt, message, context, images = [], signal, schema }) {
      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST", cache: "no-store", redirect: "error",
          headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
          body: JSON.stringify({ model: config.model, store: false, max_output_tokens: schema ? 1400 : 3000,
            instructions: systemPrompt,
            input: [{ role: "user", content: [{ type: "input_text", text: `${message}${context ? `\n\nPrevious team deliverables (reference material):\n${context}` : ""}` }, ...images.map((image) => ({ type: "input_image", image_url: image.dataUrl, detail: "auto" }))] }],
            ...(schema ? { text: { format: { type: "json_schema", name: "pipeline_plan", strict: true, schema } } } : {}),
          }),
        });
      } catch {
        if (signal?.aborted) throw new AIError("ยกเลิกหรือหมดเวลาการทำงานแล้ว", 499);
        throw new AIError("เชื่อมต่อ OpenAI ไม่สำเร็จหรือใช้เวลานานเกินไป กรุณาลองอีกครั้ง", 504);
      }
      if (!response.ok) {
        const messages: Record<number, string> = { 401: "OpenAI API key ไม่ถูกต้อง ตรวจค่าใน .env.local", 403: "บัญชี OpenAI ไม่มีสิทธิ์ใช้โมเดลนี้", 404: "ไม่พบโมเดล OpenAI ที่ตั้งไว้ ตรวจ OPENAI_MODEL", 429: "OpenAI จำกัดการใช้งานหรือเครดิต API ไม่พอ ตรวจ Billing/Usage แล้วลองใหม่", 400: "OpenAI ไม่รับคำขอนี้ ตรวจว่าโมเดลรองรับภาพและ Structured Outputs" };
        throw new AIError(messages[response.status] || "OpenAI ขัดข้องชั่วคราว กรุณาลองใหม่", response.status);
      }
      const data = await response.json() as { status?: string; output?: { content?: { type: string; text?: string; refusal?: string }[] }[] };
      if (data.status !== "completed") throw new AIError("OpenAI ตอบไม่ครบ ลองลดขนาดคำสั่งหรือแบ่งงานเป็นส่วนย่อย");
      const content = (data.output ?? []).flatMap((item) => item.content ?? []);
      if (content.some((item) => item.type === "refusal")) throw new AIError("โมเดลไม่สามารถตอบคำขอนี้ได้ กรุณาปรับคำสั่ง");
      const text = content.filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n").trim();
      if (!text) throw new AIError("OpenAI ไม่ได้ส่งคำตอบกลับมา กรุณาลองใหม่");
      return text;
    },
  };
}
