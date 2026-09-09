import { AIError } from "@/lib/ai-provider";

const agentPrompts = {
  planner: "คุณคือผู้ช่วยวางแผนส่วนตัว ช่วยแบ่งเป้าหมายเป็นขั้นตอน จัดลำดับความสำคัญ และกำหนด deadline ที่ทำได้จริง",
  study: "คุณคือโค้ชด้านการเรียน ช่วยจัดตารางอ่านหนังสือ อธิบายเนื้อหา สร้างแบบฝึกหัด และติดตามความคืบหน้า",
  career: "คุณคือที่ปรึกษาด้านอาชีพ ช่วยปรับ CV, portfolio, cover letter และวางแผนการสมัครงาน",
  builder: "คุณคือ technical product builder ช่วยวางแผนฟีเจอร์ ออกแบบระบบ แบ่งงานพัฒนา และตรวจสอบปัญหาทางเทคนิค",
} as const;

type AgentId = keyof typeof agentPrompts;

const resultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "steps", "suggestedTasks", "reply"],
  properties: {
    summary: { type: "string" },
    steps: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "description", "status"], properties: { title: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["pending", "complete"] } } } },
    suggestedTasks: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "priority", "dueDate"], properties: { title: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] }, dueDate: { type: ["string", "null"] } } } },
    reply: { type: "string" },
  },
} as const;

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { agent?: string; command?: string; apiKey?: string };
    const agent = body.agent as AgentId;
    const command = body.command?.trim() ?? "";
    const apiKey = body.apiKey?.trim() ?? "";
    if (!Object.prototype.hasOwnProperty.call(agentPrompts, agent)) return fail("เลือก Agent ที่ต้องการเริ่มงานก่อน", 400);
    if (!command || command.length > 4000) return fail("กรุณาใส่คำสั่งความยาวไม่เกิน 4,000 ตัวอักษร", 400);
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) return fail("API Key ใช้งานไม่ได้หรือไม่มีสิทธิ์เรียก API", 400);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        store: false,
        instructions: `${agentPrompts[agent]}\n\nตอบเป็นภาษาไทย และส่ง JSON ตาม schema เท่านั้น`,
        input: command,
        max_output_tokens: 1800,
        text: { format: { type: "json_schema", name: "amaris_pipeline_result", strict: true, schema: resultSchema } },
      }),
    });
    if (response.status === 401 || response.status === 403) return fail("API Key ใช้งานไม่ได้หรือไม่มีสิทธิ์เรียก API", 401);
    if (response.status === 429) return fail("OpenAI จำกัดการใช้งานชั่วคราว กรุณารอสักครู่แล้วลองใหม่", 429);
    if (!response.ok) return fail("OpenAI ไม่สามารถประมวลผลคำสั่งนี้ได้ กรุณาลองใหม่", 502);
    const data = await response.json() as { status?: string; output?: { content?: { type: string; text?: string; refusal?: string }[] }[] };
    const content = (data.output ?? []).flatMap((item) => item.content ?? []);
    if (content.some((item) => item.type === "refusal")) return fail("Agent ไม่สามารถทำคำสั่งนี้ได้ กรุณาปรับคำสั่ง", 422);
    const text = content.filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n").trim();
    if (!text) return fail("Agent ไม่ได้ส่งผลลัพธ์กลับมา กรุณาลองใหม่", 502);
    let result: unknown;
    try { result = JSON.parse(text); } catch { return fail("รูปแบบผลลัพธ์จาก Agent ไม่ถูกต้อง กรุณาลองใหม่", 502); }
    return Response.json({ result, agent, startedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return fail("การทำงานใช้เวลานานเกินไป กรุณาลองใหม่", 504);
    if (error instanceof AIError) return fail(error.message, error.status);
    return fail("เชื่อมต่อ OpenAI ไม่สำเร็จ กรุณาลองใหม่", 502);
  }
}
