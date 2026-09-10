"use client";

import { useState } from "react";
import { dayKey } from "@/lib/calendar";
import { monthlyTaskCounts } from "@/lib/task-counts";
import type { Task } from "@/lib/types";

export default function TaskCounts({ tasks }: { tasks: Task[] }) {
  const [month, setMonth] = useState(() => dayKey(new Date()).slice(0, 7));
  const [search, setSearch] = useState("");
  const rows = monthlyTaskCounts(tasks, month).filter((row) => row.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <section className="panel task-counts" aria-label="จำนวนครั้งของงานรายเดือน">
    <div className="panel-heading"><h3>จำนวนครั้งของงาน</h3><label>เดือน <input type="month" aria-label="เดือนที่ต้องการนับงาน" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>
    <label>ค้นหางาน <input type="search" placeholder="เช่น สอนโกะ kus" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <p className="muted">นับ 1 งานเป็น 1 ครั้ง ตามวันกำหนดส่งในเดือนที่เลือก · ทำแล้ว = กด Complete · ไม่รวมงานที่ลบหรือไม่มีวันกำหนดส่ง</p>
    <div className="task-counts-table"><table><thead><tr><th scope="col">งาน</th><th scope="col">ทำแล้ว</th><th scope="col">ยังไม่เสร็จ</th><th scope="col">ทั้งหมด</th></tr></thead><tbody>{rows.map((row) => <tr key={row.title}><th scope="row">{row.title}</th><td>{row.completed} ครั้ง</td><td>{row.pending} ครั้ง</td><td>{row.total} ครั้ง</td></tr>)}</tbody></table></div>
    {!rows.length && <p className="empty-state">ไม่พบงานในเดือนที่เลือก</p>}
  </section>;
}
