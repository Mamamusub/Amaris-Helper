import { AIError, getAIProvider } from "@/lib/ai-provider";
import { agents, chooseRoute, getAgent } from "@/lib/agents";

const maxRequestLength = 4000;

type ChatBody = { agentId?: unknown; request?: unknown; history?: unknown };

type HistoryItem = { role?: unknown; content?: unknown };

function routeAgent(agentId: string, request: string) {
  const requested = getAgent(agentId);
  if (!requested) throw new AIError("ไม่พบเอเจนต์ที่เลือก", 400);
  if (agentId === "secretary") return { agent: requested, routed: false };
  const route = chooseRoute(request);
  if (route.includes(agentId)) return { agent: requested, routed: false };
  const replacement = route.map((id) => getAgent(id)).find(Boolean);
  return { agent: replacement ?? requested, routed: Boolean(replacement && replacement.id !== requested.id) };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ChatBody;
    if (typeof body.request !== "string" || !body.request.trim() || body.request.length > maxRequestLength) {
      throw new AIError("กรุณาระบุคำสั่งไม่เกิน 4,000 ตัวอักษร", 400);
    }
    if (typeof body.agentId !== "string") throw new AIError("กรุณาระบุเอเจนต์", 400);
    const history = Array.isArray(body.history) ? body.history.filter((item): item is HistoryItem => Boolean(item && typeof item === "object" && typeof (item as HistoryItem).content === "string" && ((item as HistoryItem).role === "user" || (item as HistoryItem).role === "agent"))).slice(-8) : [];
    const selected = routeAgent(body.agentId, body.request);
    const provider = getAIProvider();
    const historyText = history.map((item) => `${item.role === "user" ? "User" : "Agent"}: ${item.content}`).join("\n");
    const answer = await provider.generate({
      systemPrompt: `You are ${selected.agent.name}, ${selected.agent.role}, in Pai's Amaris AI team. ${selected.routed ? `The user opened another agent, but this request belongs to you. Briefly say you are taking over from ${getAgent(body.agentId)?.name ?? "the previous agent"}.` : "Answer as the selected specialist."} Respond in the user's language, Thai by default. Give a direct, useful answer with concrete next steps. Do not claim to browse, execute code, modify files, or access private systems. Do not reveal chain of thought. Your capabilities are: ${selected.agent.capabilities.join(", ")}.`,
      message: body.request.trim(),
      context: historyText || undefined,
    });
    return Response.json({ answer, agent: selected.agent.id, agentName: selected.agent.name, routed: selected.routed, provider: provider.name });
  } catch (error) {
    const status = error instanceof AIError ? error.status : 400;
    const message = error instanceof AIError ? error.message : "ส่งคำสั่งไม่สำเร็จ กรุณาลองใหม่";
    return Response.json({ error: message }, { status });
  }
}

export async function GET() {
  return Response.json({ agents: agents.map(({ id, name, role }) => ({ id, name, role })) });
}
