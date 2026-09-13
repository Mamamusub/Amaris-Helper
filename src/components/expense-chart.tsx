import { categories, money } from "@/lib/finance";
import styles from "./expense-chart.module.css";

const colors = ["#71864c", "#bf8654", "#708da1", "#a27e9c", "#5d9385", "#b49d48", "#bc7770", "#8b8980"];
export default function ExpenseChart({ items }: { items: { name: string; amount: number }[] }) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const slices = items.map((item, index) => ({ ...item, share: item.amount / total * 100, offset: items.slice(0, index).reduce((sum, previous) => sum + previous.amount, 0) / total * 100, color: colors[(categories.expense.includes(item.name) ? categories.expense.indexOf(item.name) : [...item.name].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % colors.length] }));
  if (!total) return <div className={styles.empty}><div className={styles.emptyRing} aria-hidden="true" /><p>ยังไม่มีรายจ่ายในเดือนนี้</p></div>;
  return <div className={styles.layout}><div className={styles.chart}><svg viewBox="0 0 200 200" role="img" aria-label={`สัดส่วนรายจ่ายทั้งหมด ${money(total)} รายละเอียดแต่ละหมวดหมู่อยู่ด้านข้าง`}><circle cx="100" cy="100" r="78" fill="none" stroke="#eceee3" strokeWidth="28" />{slices.map((slice) => <circle key={slice.name} cx="100" cy="100" r="78" fill="none" stroke={slice.color} strokeWidth="28" pathLength="100" strokeDasharray={`${slice.share} ${100 - slice.share}`} strokeDashoffset={-slice.offset} transform="rotate(-90 100 100)"><title>{slice.name}: {money(slice.amount)} ({slice.share.toFixed(1)}%)</title></circle>)}</svg><div className={styles.center}><span>ใช้จ่ายรวม</span><strong>{money(total)}</strong><small>{items.length} หมวดหมู่</small></div></div><ul className={styles.legend}>{slices.map((slice) => <li key={slice.name}><span className={styles.dot} style={{ backgroundColor: slice.color }} aria-hidden="true" /><span className={styles.name}>{slice.name}<small>{slice.share.toFixed(1)}%</small></span><strong>{money(slice.amount)}</strong></li>)}</ul></div>;
}
