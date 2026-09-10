import { AIError, getAIProvider } from "@/lib/ai-provider";
import { getAgent } from "@/lib/agents";

type PipelineBody = { agentId?: unknown; command?: unknown };

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
    const body = await request.json() as PipelineBody;
    const agent = typeof body.agentId === "string" ? getAgent(body.agentId) : undefined;
    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!agent) return fail("เลือก Agent ที่ต้องการเริ่มงานก่อน", 400);
    if (!command || command.length > 4000) return fail("กรุณาใส่คำสั่งความยาวไม่เกิน 4,000 ตัวอักษร", 400);
    const provider = getAIProvider();
    const text = await provider.generate({
      systemPrompt: `You are ${agent.name}, ${agent.role}, in Pai's Amaris AI team. ${agent.description} Respond in Thai by default and return JSON matching the requested schema only. Your capabilities are: ${agent.capabilities.join(", ")}.`,
      message: command,
      schema: resultSchema,
      signal: AbortSignal.timeout(90000),
    });
    return Response.json({ result: JSON.parse(text), agent: agent.id, agentName: agent.name, startedAt: new Date().toISOString(), provider: provider.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AIError) return fail(error.message, error.status);
    return fail(error instanceof SyntaxError ? "รูปแบบผลลัพธ์จาก Agent ไม่ถูกต้อง กรุณาลองใหม่" : "เชื่อมต่อ OpenAI ไม่สำเร็จ กรุณาลองใหม่", 502);
  }
}
