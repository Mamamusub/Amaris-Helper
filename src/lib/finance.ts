export const categories = {
  income: ["เงินเดือน", "ฟรีแลนซ์", "ขายสินค้า", "รายรับอื่น ๆ"],
  expense: ["อาหาร", "เดินทาง", "ที่อยู่อาศัย", "ช้อปปิ้ง", "สุขภาพ", "การศึกษา", "บันเทิง", "รายจ่ายอื่น ๆ"],
};
export type CategoryMap = Record<"income" | "expense", string[]>;
export function readCategories(storage: Pick<Storage, "getItem">, key: string): CategoryMap {
  const raw = storage.getItem(key);
  if (!raw) return { income: [...categories.income], expense: [...categories.expense] };
  const data = JSON.parse(raw);
  if (!data || !["income", "expense"].every((type) => Array.isArray(data[type]) && data[type].length && data[type].every((name: unknown) => typeof name === "string" && name.trim() && name.length <= 40))) throw new Error("Invalid categories");
  return { income: [...new Set<string>(data.income)], expense: [...new Set<string>(data.expense)] };
}
export function changeCategory(current: CategoryMap, type: "income" | "expense", raw: string, remove: boolean): CategoryMap {
  const name = raw.trim();
  if (!name || name.length > 40) throw new Error("กรอกชื่อหมวดหมู่ 1–40 ตัวอักษร");
  if (remove) {
    const remaining = current[type].filter((item) => item !== name);
    if (!remaining.length) throw new Error("ต้องเหลืออย่างน้อย 1 หมวดหมู่ต่อประเภท");
    return { ...current, [type]: remaining };
  }
  if (current[type].some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("มีหมวดหมู่นี้แล้ว");
  return { ...current, [type]: [...current[type], name] };
}
export type Entry = { purpose?: "" | "investment" | "goal"; goalId?: string; id: string; type: "income" | "expense"; amount: number; title: string; category: string; date: string; note: string; updatedAt: string };
export function financeMonth(storage: Pick<Storage, "getItem">, key: string, entries: Entry[], currentMonth: string) {
  try {
    const saved = storage.getItem(`${key}.month`);
    if (saved && /^\d{4}-(0[1-9]|1[0-2])$/.test(saved) && saved >= "1900-01" && saved <= "9999-12") return saved;
  } catch { /* Entries remain readable even if preferences are unavailable. */ }
  const months = [...new Set(entries.map((entry) => entry.date.slice(0, 7)))].sort();
  return months.includes(currentMonth) ? currentMonth : months.at(-1) ?? currentMonth;
}
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
  if (!Array.isArray(data) || !data.every((e) => e && typeof e.id === "string" && (e.type === "income" || e.type === "expense") && Number.isSafeInteger(e.amount) && e.amount > 0 && typeof e.title === "string" && typeof e.category === "string" && typeof e.date === "string" && validDate(e.date) && typeof e.note === "string" && typeof e.updatedAt === "string" && (e.purpose === undefined || ["", "investment", "goal"].includes(e.purpose)) && (e.goalId === undefined || typeof e.goalId === "string"))) throw new Error("อ่านข้อมูลบัญชีไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์");
  return data;
}
export function totals(entries: Entry[]) {
  const income = entries.filter((e) => e.type === "income").reduce((sum, e) => sum + e.amount, 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((sum, e) => sum + e.amount, 0);
  return { income, expense, balance: income - expense };
}
export const money = (cents: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(cents / 100);
export function monthCells(month: string) {
  const [year, index] = month.split("-").map(Number);
  const first = new Date(year, index - 1, 1).getDay();
  const count = new Date(year, index, 0).getDate();
  return Array.from({ length: 42 }, (_, i) => i >= first && i < first + count ? `${month}-${String(i - first + 1).padStart(2, "0")}` : null);
}
