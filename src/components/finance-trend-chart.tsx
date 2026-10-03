import { money } from "@/lib/finance";
import styles from "./finance-view.module.css";

export default function TrendChart({title, points, percent=false}: {title:string;points:{label:string;value:number}[];percent?:boolean}) {
 const format=(value:number)=>percent?`${value.toFixed(1)}%`:money(value);
 const min=Math.min(0,...points.map(p=>p.value)), max=Math.max(1,...points.map(p=>p.value));
 const path=points.map((p,i)=>`${i ? "L":"M"}${25+(points.length===1 ? 225 : i/(points.length-1)*450)},${155-(p.value-min)/(max-min)*130}`).join(" ");
 return <section className={styles.panel}><h3>{title}</h3>{!points.length ? <p className={styles.empty}>No history yet.</p> : <><svg className={styles.trendChart} viewBox="0 0 500 195" role="img" aria-label={`${title}. Exact values in the data table below.`}>
  <line x1="25" x2="475" y1={155-(0-min)/(max-min)*130} y2={155-(0-min)/(max-min)*130} stroke="#dce1d2"/>
  <path d={path} fill="none" stroke="#71864c" strokeWidth="3"/>
  {points.map((p,i)=><circle key={p.label} cx={25+(points.length===1 ? 225:i/(points.length-1)*450)} cy={155-(p.value-min)/(max-min)*130} r="3" fill="#71864c"><title>{p.label}: {format(p.value)}</title></circle>)}
  <text x="25" y="185" fontSize="11" fill="#68725e">{points[0].label}</text><text x="475" y="185" textAnchor="end" fontSize="11" fill="#68725e">{points.at(-1)?.label}</text>
 </svg><details><summary>View chart data</summary><div className={styles.dataScroll}><table className={styles.dataTable}><caption>{title}</caption><thead><tr><th scope="col">Period</th><th scope="col">Amount</th></tr></thead><tbody>{points.map(p=><tr key={p.label}><th scope="row">{p.label}</th><td>{format(p.value)}</td></tr>)}</tbody></table></div></details></>}</section>;
}
