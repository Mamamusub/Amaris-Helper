import { privateJson, requireOrigin, verifiedAccount } from "@/lib/auth-server";

const bucket = "workspace-files";
export async function POST(request: Request) {
  try { requireOrigin(request); } catch { return privateJson({ error: "Forbidden" }, 403); }
  try {
    const { client, user } = await verifiedAccount();
    if (!user) return privateJson({ error: "Unauthorized" }, 401);
    const body = await request.json();
    if (body.userId !== user.id) return privateJson({ error: "Account changed" }, 401);
    if (!Number.isInteger(body.size) || body.size < 1 || body.size > 25 * 1024 * 1024) return privateJson({ error: "ไฟล์ต้องมีขนาด 1 byte ถึง 25 MB" }, 400);
    const path = `${user.id}/${crypto.randomUUID()}`;
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
    if (error) return privateJson({ error: "อัปโหลดไม่ได้ กรุณาตรวจการตั้งค่า workspace-files ใน Supabase" }, 503);
    return privateJson({ userId: user.id, path, signedUrl: data.signedUrl });
  } catch { return privateJson({ error: "เชื่อมต่อพื้นที่เก็บไฟล์ไม่ได้" }, 503); }
}

export async function GET(request: Request) {
  try {
    const { client, user } = await verifiedAccount();
    if (!user) return privateJson({ error: "Unauthorized" }, 401);
    const params = new URL(request.url).searchParams;
    if (params.get("userId") !== user.id) return privateJson({ error: "Account changed" }, 401);
    const path = params.get("path") ?? "";
    if (!path.startsWith(`${user.id}/`) || !/^[a-f0-9-]+\/[a-f0-9-]+$/.test(path)) return privateJson({ error: "Forbidden" }, 403);
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60);
    if (error) return privateJson({ error: "โหลดไฟล์ไม่สำเร็จ" }, 404);
    return privateJson({ signedUrl: data.signedUrl });
  } catch { return privateJson({ error: "เชื่อมต่อพื้นที่เก็บไฟล์ไม่ได้" }, 503); }
}
