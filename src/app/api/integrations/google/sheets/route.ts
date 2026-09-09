import { accessToken, failure, IntegrationError, remoteFetch } from "@/lib/integration-server";

function spreadsheetId(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? trimmed;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const id = spreadsheetId(params.get("id") || process.env.GOOGLE_SHEET_URL || process.env.GOOGLE_SHEET_ID || "");
    const range = (params.get("range") || process.env.GOOGLE_SHEET_RANGE || "PORT!A1:I100").trim();
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || range.length > 200) throw new IntegrationError("ใส่ Google Sheet ID หรือ URL และช่วงข้อมูลให้ถูกต้อง");
    const token = await accessToken();
    const response = await remoteFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? "Google ยังไม่มีสิทธิ์อ่าน Sheets กรุณาไป Settings แล้วกดอัปเดตสิทธิ์ Google" : "อ่าน Google Sheet ไม่สำเร็จ ตรวจสิทธิ์และชื่อชีต/ช่วงข้อมูลอีกครั้ง.", response.status === 401 || response.status === 403 ? 401 : 502);
    const data = await response.json() as { values?: string[][] };
    return Response.json({ values: data.values ?? [], range });
  } catch (error) { return failure(error); }
}