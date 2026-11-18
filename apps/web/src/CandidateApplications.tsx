import { useEffect, useMemo, useState } from "react";
import { listApplications, updateApplication, type ApiApplication } from "./lib/api";

type CandidateRole = "school_student" | "college_student" | "job_seeker";
const activeStatuses = new Set(["submitted", "shortlisted", "interview", "offer"]);

export function applicationProgress(status: string) {
  const normalised = status === "interviewing" ? "interview" : status === "offered" ? "offer" : status;
  const steps = ["submitted", "shortlisted", "interview", "offer"];
  const index = steps.indexOf(normalised);
  return index < 0 ? 0 : Math.round(((index + 1) / steps.length) * 100);
}

export function CandidateApplications({ role, onBrowse }: { role: CandidateRole; onBrowse: () => void }) {
  const [applications, setApplications] = useState<ApiApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [message, setMessage] = useState("Loading your private application workspace…");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { items } = await listApplications();
      setApplications(items);
      setSelectedId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? null));
      setMessage("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Applications could not be loaded.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function act(applicationId: string, action: "withdraw" | "accept_offer" | "decline_offer") {
    setBusy(true);
    try {
      await updateApplication(applicationId, action);
      setMessage(
        action === "withdraw"
          ? "Application withdrawn and recorded in your timeline."
          : action === "accept_offer"
            ? "Offer accepted. The hiring team has been notified."
            : "Offer declined and application closed.",
      );
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not update application.");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => applications.filter((application) => filter === "all" || (filter === "active" ? activeStatuses.has(application.status) : !activeStatuses.has(application.status))), [applications, filter]);
  const selected = applications.find((application) => application.id === selectedId) ?? null;
  const active = applications.filter((application) => activeStatuses.has(application.status)).length;

  if (role === "school_student") return <section className="applications-page school-pathway-page"><header><p className="eyebrow">CAREER PATHWAYS</p><h1>Build evidence before applications begin.</h1><p>School profiles use exploration, skill activities and counsellor-guided plans. Internship and job applications unlock when eligibility changes.</p><button onClick={onBrowse}>Explore pathways and programmes →</button></header></section>;

  return <section className="applications-page"><header className="applications-hero"><div><p className="eyebrow">APPLICATION COMMAND CENTRE</p><h1>Every application.<br /><em>Every next move.</em></h1><p>A private, verified history of your applications and employer-led updates.</p></div><div className="application-health"><span>{active}</span><strong>active applications</strong><small>{applications.length} submitted in total</small><button onClick={onBrowse}>Discover new roles</button></div></header>
    {message && <p className="governance-message" role="status">{message}</p>}
    <div className="application-kpis"><article><strong>{applications.length}</strong><span>Total applications</span></article><article><strong>{active}</strong><span>In progress</span></article><article><strong>{applications.filter((item) => item.status === "interview").length}</strong><span>Interviews</span></article><article><strong>{applications.filter((item) => item.status === "offer").length}</strong><span>Offers</span></article></div>
    <div className="application-controls"><div role="group" aria-label="Application filter">{(["all", "active", "closed"] as const).map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
    <div className="application-console"><aside className="application-list" aria-label="Your applications">{filtered.length ? filtered.map((application) => <button key={application.id} className={selectedId === application.id ? "active" : ""} onClick={() => setSelectedId(application.id)}><div><span className={`status-pill status-${application.status}`}>{application.status}</span><strong>{application.opportunity.title}</strong><small>{application.opportunity.organisationName} · {new Date(application.submittedAt).toLocaleDateString()}</small></div><b>{applicationProgress(application.status)}%</b></button>) : <div className="empty-workflow"><strong>No matching applications.</strong><button onClick={onBrowse}>Browse opportunities</button></div>}</aside>
      <main className="application-detail">{selected ? <><header><div><span className={`status-pill status-${selected.status}`}>{selected.status}</span><h2>{selected.opportunity.title}</h2><p>{selected.opportunity.organisationName} · {selected.opportunity.location ?? "Location shared by employer"} · {selected.opportunity.workMode}</p></div><div className="progress-ring"><span>{applicationProgress(selected.status)}%</span></div></header><section className="next-move-card"><p className="small-label">CURRENT STATUS</p><h3>{selected.status === "submitted" ? "Application under review" : `Application ${selected.status}`}</h3><p>{selected.status === "submitted" ? "No action is required. You will see verified employer updates here." : selected.status === "offer" ? "You have an active offer. Review all terms before accepting or declining." : "Review the employer communication and prepare the appropriate next step."}</p>
        {activeStatuses.has(selected.status) && <div className="applicant-actions" style={{ marginTop: "12px" }}>
          {selected.status === "offer" && <>
            <button className="approve" disabled={busy} onClick={() => act(selected.id, "accept_offer")}>Accept offer</button>
            <button className="danger-outline" disabled={busy} onClick={() => act(selected.id, "decline_offer")}>Decline offer</button>
          </>}
          <button className="danger-outline" disabled={busy} onClick={() => act(selected.id, "withdraw")}>Withdraw application</button>
        </div>}
      </section>{selected.coverNote && <section className="detail-section"><p className="small-label">YOUR APPLICATION NOTE</p><p>{selected.coverNote}</p></section>}<section className="workflow-timeline"><div className="section-row"><div><p className="small-label">VERIFIED TIMELINE</p><h3>Application history</h3></div></div><article><span></span><div><strong>Application submitted</strong><time>{new Date(selected.submittedAt).toLocaleString()}</time><p>Last updated {new Date(selected.updatedAt).toLocaleString()}.</p></div></article></section></> : <div className="application-empty-detail"><h2>Select an application</h2><p>Its status and verified history will appear here.</p></div>}</main></div>
  </section>;
}
