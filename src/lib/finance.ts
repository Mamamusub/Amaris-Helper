export const categories = {
  income: ["เงินเดือน", "ฟรีแลนซ์", "ขายสินค้า", "รายรับอื่น ๆ"],
  expense: ["อาหาร", "เดินทาง", "ที่อยู่อาศัย", "ช้อปปิ้ง", "สุขภาพ", "การศึกษา", "บันเทิง", "รายจ่ายอื่น ๆ"],
};
export type Entry = { id: string; type: "income" | "expense"; amount: number; title: string; category: string; date: string; note: string; updatedAt: string };
export function parseAmount(value: string): number | null {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return amount > 0 ? amount : null;
}
export function validDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "9999-12-31" && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function readEntries(storage: Pick<Storage, "getItem">, key: string): Entry[] {
  const data: unknown = JSON.parse(storage.getItem(key) ?? "[]");
  if (!Array.isArray(data) || !data.every((e) => e && typeof e.id === "string" && (e.type === "income" || e.type === "expense") && Number.isSafeInteger(e.amount) && e.amount > 0 && typeof e.title === "string" && typeof e.category === "string" && typeof e.date === "string" && validDate(e.date) && typeof e.note === "string" && typeof e.updatedAt === "string")) throw new Error("อ่านข้อมูลบัญชีไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์");
  return data;
}
export function totals(entries: Entry[]) {
  const income = entries.filter((e) => e.type === "income").reduce((sum, e) => sum + e.amount, 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((sum, e) => sum + e.amount, 0);
  return { income, expense, balance: income - expense };
}
export const money = (cents: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(cents / 100);
