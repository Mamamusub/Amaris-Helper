import { accessToken, failure, IntegrationError, remoteFetch } from "@/lib/integration-server";

const defaultSheetId = "14noIhRV0-H2P3m4io1WJXyDAnhRg71KT2cv-qTM5sbQ";

function spreadsheetId(value: string) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match?.[1]) return match[1];
  } catch { /* Treat a plain spreadsheet ID as valid input. */ }
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? trimmed.replace(/^['"]|['"]$/g, "");
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const configuredUrl = process.env.GOOGLE_SHEET_URL?.trim() || process.env.GOOGLE_SHEET_ID?.trim() || defaultSheetId;
    const id = spreadsheetId(params.get("id")?.trim() || configuredUrl);
    const range = (params.get("range")?.trim() || process.env.GOOGLE_SHEET_RANGE?.trim() || "Summarize!A1:I100").trim();
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || range.length > 200) throw new IntegrationError("GOOGLE_SHEET_URL ต้องเป็น Google Sheets URL ที่ถูกต้อง หรือใช้ Spreadsheet ID");
    const token = await accessToken();
    const response = await remoteFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? "Google ยังไม่มีสิทธิ์อ่าน Sheets กรุณาไป Settings แล้วกดอัปเดตสิทธิ์ Google" : "อ่าน Google Sheet ไม่สำเร็จ ตรวจสิทธิ์และชื่อชีต/ช่วงข้อมูลอีกครั้ง.", response.status === 401 || response.status === 403 ? 401 : 502);
    const data = await response.json() as { values?: string[][] };
    return Response.json({ values: data.values ?? [], range });
  } catch (error) { return failure(error); }
}