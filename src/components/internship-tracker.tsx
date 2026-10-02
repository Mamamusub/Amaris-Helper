import { useEffect, useState } from "react";
import { applicationDates, applicationStatuses, applicationSummary, applicationUrgency, careerDate, careerDays, interestLevels, periodMatches, type Application } from "@/lib/career-storage";
import styles from "./career-view.module.css";

const filterFields = [
  ["field", "Field"], ["location", "Location"], ["status", "Status"],
  ["internshipPeriod", "Internship period"], ["periodMatch", "Period match"], ["interestLevel", "Interest level"],
] as const;
type FilterKey = typeof filterFields[number][0];
type View = "Cards" | "Table" | "Kanban";
const valueOf = (app: Application, key: FilterKey) => app[key]?.trim() || "";
const nextStep = (app: Application) => applicationDates(app).find(event => event.label !== "Deadline");

export default function InternshipTracker({ applications, onOpen, onAdd, onStatus }: {
  applications: Application[];
  onOpen: (app: Application) => void;
  onAdd: () => void;
  onStatus: (app: Application, status: Application["status"]) => void;
}) {
  const [view, setView] = useState<View>("Cards");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({});
  const [sort, setSort] = useState("deadline");
  const [group, setGroup] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  const shown = applications.filter(app =>
    `${app.company} ${app.position}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    filterFields.every(([key]) => !filters[key] || (filters[key] === "__unspecified" ? !valueOf(app, key) : valueOf(app, key) === filters[key]))
  ).sort((a, b) => {
    const date = (app: Application) => sort === "deadline" ? app.deadline : nextStep(app)?.date;
    return sort === "company" ? a.company.localeCompare(b.company) || a.position.localeCompare(b.position) :
      (date(a) || "9999").localeCompare(date(b) || "9999") || a.company.localeCompare(b.company);
  });
  const periods = [...new Set(shown.map(app => app.internshipPeriod?.trim() || "Unspecified period"))].sort();
  function dates(app: Application) {
    const active = !["Offer", "Rejected"].includes(app.status);
    return applicationDates(app).map(event => <span key={event.label + event.date} className={active && (careerDays(event.date, now) ?? 1) < 0 ? styles.overdue : styles.dateLabel}>
      <span>{active ? applicationUrgency(event.label, event.date, now) : event.label}</span>
      <small>{careerDate(event.date, now)}</small>
    </span>);
  }
  function statusSelect(app: Application) {
    return <select aria-label={`${app.company} / ${app.position} status`} value={app.status} onChange={event => onStatus(app, event.target.value as Application["status"])}>
      {applicationStatuses.map(status => <option key={status}>{status}</option>)}
    </select>;
  }
  function card(app: Application) {
    return <article key={app.id} className={styles.internshipCard}>
      <button className={styles.cardOpen} onClick={() => onOpen(app)} aria-label={`Open ${app.company} / ${app.position}`}>
        <span className={styles.cardHeading}><strong>{app.company}</strong><span className={styles.badge}>{app.status}</span></span>
        <span className={styles.position}>{app.position}</span>
        <span>{app.field || "Field unspecified"}{app.sample && " · Sample"}</span>
        <span>{app.internshipPeriod || "Period unspecified"}{app.duration && ` · ${app.duration}`}</span>
        <span>{app.location || "Location unspecified"} · {app.workType || "Work type unspecified"}</span>
        <span className={styles.cardHeading}><span className={styles.badge}>Interest: {app.interestLevel || "Unspecified"}</span><span>{app.applicationOpen || "Opening unknown"}</span></span>
        {app.periodMatch && <span>Period: {app.periodMatch}</span>}
        <span className={styles.cardDates}>{dates(app)}{!applicationDates(app).length && <span>No deadline / next step date</span>}</span>
        {app.nextAction && <span>Next: {app.nextAction}</span>}
      </button>
      {statusSelect(app)}
    </article>;
  }
  function table(apps: Application[]) {
    return <div className={styles.tableScroll}><table className={styles.trackerTable}>
      <caption className={styles.srOnly}>Internship applications</caption>
      <thead><tr>{["Company / Position", "Field", "Status", "Internship period", "Deadline / Next step", "Location / Work type", "Interest"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{apps.map(app => <tr key={app.id}>
        <td><button className="text-button" onClick={() => onOpen(app)}>{app.company}<br/>{app.position}</button></td>
        <td>{app.field || "—"}</td><td>{statusSelect(app)}</td><td>{app.internshipPeriod || "—"}<br/>{app.duration}</td>
        <td>{dates(app)}{app.nextAction && <small>Next: {app.nextAction}</small>}</td>
        <td>{app.location || "—"}<br/>{app.workType || "—"}</td><td>{app.interestLevel || "—"}</td>
      </tr>)}</tbody>
    </table></div>;
  }
  function render(apps: Application[]) {
    if (view === "Table") return table(apps);
    if (view === "Kanban") return <div className={styles.kanban}>{applicationStatuses.map(status => <section className={styles.kanbanColumn} key={status} aria-label={`${status} applications`}>
      <h4>{status} <span className={styles.badge}>{apps.filter(app => app.status === status).length}</span></h4>
      {apps.filter(app => app.status === status).map(card)}
      {!apps.some(app => app.status === status) && <p className={styles.empty}>No internships</p>}
    </section>)}</div>;
    return <div className={styles.internshipCards}>{apps.map(card)}</div>;
  }
  return <section className="panel">
    <div className="panel-heading"><div><span className="eyebrow">YOUR OPPORTUNITIES</span><h3>Internship Tracker</h3></div><button className="primary-button" onClick={onAdd}>+ Add internship</button></div>
    <div className={styles.trackerSummary} aria-label="Internship summary">{applicationSummary(applications).map(({label, count}) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
    <div className={styles.trackerToolbar}>
      <label>Search company / position<input value={query} onChange={event => setQuery(event.target.value)}/></label>
      <div className={styles.viewToggle} role="group" aria-label="Internship view">{(["Cards", "Table", "Kanban"] as View[]).map(item => <button key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item}</button>)}</div>
      <label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="deadline">Deadline first</option><option value="next">Next step date first</option><option value="company">Company</option></select></label>
      <label className={styles.check}><input type="checkbox" checked={group} onChange={event => setGroup(event.target.checked)}/>Group by internship period</label>
    </div>
    <div className={styles.trackerFilters}>{filterFields.map(([key, label]) => {
      const fixed = key === "status" ? applicationStatuses : key === "periodMatch" ? periodMatches : key === "interestLevel" ? interestLevels : [];
      const options = [...new Set([...fixed, ...applications.map(app => valueOf(app, key))])].filter(Boolean).sort();
      return <label key={key}>{label}<select value={filters[key] || ""} onChange={event => setFilters({...filters, [key]:event.target.value})}><option value="">All</option><option value="__unspecified">Unspecified</option>{options.map(value => <option key={value}>{value}</option>)}</select></label>;
    })}</div>
    <div className={styles.trackerToolbar}><small>{shown.length} of {applications.length} internships</small><button className="text-button" onClick={() => {setFilters({}); setQuery("");}}>Clear filters</button></div>
    {!shown.length ? <p className={styles.empty}>{applications.length ? "No internships match these filters." : "Add your first internship opportunity."}</p> : group ? periods.map(period => <section className={styles.periodGroup} key={period}><h4>{period}</h4>{render(shown.filter(app => (app.internshipPeriod?.trim() || "Unspecified period") === period))}</section>) : render(shown)}
  </section>;
}
