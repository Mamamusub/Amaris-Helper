import { privateJson, requireOrigin, verifiedAccount } from "@/lib/auth-server";
export async function GET() {
  try {
    const { client, user } = await verifiedAccount();
    if (!user) return privateJson({ error: "Unauthorized" }, 401);
    const { data, error } = await client.rpc("workspace_snapshot");
    if (error) return privateJson({ error: "โหลดข้อมูลไม่สำเร็จ" }, 503);
    return privateJson({ userId: user.id, records: data });
  } catch { return privateJson({ error: "เชื่อมต่อไม่ได้" }, 503); }
}
export async function POST(request: Request) {
  try { requireOrigin(request); } catch { return privateJson({ error: "Forbidden" }, 403); }
  try {
    const { client, user } = await verifiedAccount();
    if (!user) return privateJson({ error: "Unauthorized" }, 401);
    const text = await request.text();
    if (text.length > 8000000) return privateJson({ error: "ข้อมูลมากเกินไป" }, 413);
    const body = JSON.parse(text);
    // An expected account is only a session-switch guard, never the authority.
    if (body.userId !== user.id) return privateJson({ error: "Account changed" }, 401);
    if (!Array.isArray(body.changes) || typeof body.operationId !== "string" || body.changes.length > 5000) return privateJson({ error: "Invalid batch" }, 400);
    const { data, error } = await client.rpc("workspace_apply", { operation_id: body.operationId, changes: body.changes, importing: body.importing === true });
    if (error) return privateJson({ error: error.code === "40001" ? "ข้อมูลถูกแก้ไขจากอุปกรณ์อื่น กรุณาตรวจรายการที่ขัดแย้ง" : "บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลและลองใหม่", conflict: error.code === "40001" }, error.code === "40001" ? 409 : 400);
    return privateJson({ userId: user.id, records: data });
  } catch { return privateJson({ error: "บันทึกไม่สำเร็จ" }, 503); }
}
