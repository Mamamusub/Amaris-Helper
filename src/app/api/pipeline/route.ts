// Manual mode: even older open tabs cannot trigger a paid API request.
export async function GET() {
  return Response.json({ provider: "manual", configured: false, model: "ChatGPT · manual" });
}
export async function POST() {
  return Response.json({ error: "Pipeline เปลี่ยนเป็นคัดลอกคำสั่งไปใช้ใน ChatGPT แล้ว กรุณารีเฟรชหน้าเว็บ" }, { status: 410 });
}
