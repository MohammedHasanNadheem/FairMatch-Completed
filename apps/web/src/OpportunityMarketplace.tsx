import { FormEvent, useEffect, useMemo, useState } from "react";
import { getCandidateProfile, listOpportunities, submitApplication, type ApiOpportunity, type CandidateProfile } from "./lib/api";

type CandidateRole = "school_student" | "college_student" | "job_seeker";

type MatchOpportunity = { title: string; skills?: string[]; location?: string | null; work_mode?: string; type?: string };
type MatchProfile = { skills?: string[]; location?: string | null; preferences?: { targetRoles?: string[]; preferredLocations?: string[]; workModes?: string[]; opportunityTypes?: string[] } };

/** A transparent client-side explanation helper. It is never used to decide eligibility. */
export function explainOpportunityMatch(opportunity: MatchOpportunity, profile: MatchProfile | null) {
  if (!profile) return { score: 0, confidence: "low" as const, strengths: [], gaps: ["Complete your profile to explain relevance."] };
  const profileSkills = new Set((profile.skills ?? []).map((item) => item.toLowerCase()));
  const required = opportunity.skills ?? [];
  const strengths = required.filter((skill) => profileSkills.has(skill.toLowerCase())).map((skill) => `${skill} matches the role`);
  const gaps = required.filter((skill) => !profileSkills.has(skill.toLowerCase())).map((skill) => `${skill} is not recorded in your profile`);
  const preferences = profile.preferences ?? {};
  let score = required.length ? Math.round((strengths.length / required.length) * 60) : 20;
  if (preferences.targetRoles?.some((target) => target.toLowerCase() === opportunity.title.toLowerCase())) score += 20;
  if (opportunity.location && (preferences.preferredLocations ?? [profile.location ?? ""]).some((item) => item.toLowerCase() === opportunity.location?.toLowerCase())) score += 10;
  if (opportunity.work_mode && preferences.workModes?.includes(opportunity.work_mode)) score += 5;
  if (opportunity.type && preferences.opportunityTypes?.includes(opportunity.type)) score += 5;
  return { score: Math.min(100, score), confidence: strengths.length ? "medium" as const : "low" as const, strengths, gaps };
}

function requirementLabels(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").slice(0, 8);
  if (value && typeof value === "object") return Object.values(value).flatMap((item) => Array.isArray(item) ? item.filter((part): part is string => typeof part === "string") : []).slice(0, 8);
  return [];
}

export function OpportunityMarketplace({ signedIn, onSignIn, role }: { signedIn: boolean; onSignIn: () => void; role?: CandidateRole }) {
  const [opportunities, setOpportunities] = useState<ApiOpportunity[]>([]);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [workMode, setWorkMode] = useState("all");
  const [coverNote, setCoverNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await listOpportunities({ query, type, workMode });
      setOpportunities(response.items);
      setSelectedId((current) => response.items.some((item) => item.id === current) ? current : response.items[0]?.id ?? null);
      setMessage("");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Opportunities could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [type, workMode]);
  useEffect(() => {
    if (!signedIn) return;
    getCandidateProfile().then(setProfile).catch(() => undefined);
  }, [signedIn]);

  const selected = useMemo(() => opportunities.find((item) => item.id === selectedId) ?? null, [opportunities, selectedId]);
  const selectedMatch = useMemo(() => {
    if (!selected) return null;
    return explainOpportunityMatch({
      title: selected.title,
      skills: requirementLabels(selected.requirements),
      location: selected.location,
      work_mode: selected.workMode,
      type: selected.type,
    }, profile);
  }, [selected, profile]);

  async function search(event: FormEvent) { event.preventDefault(); await load(); }
  async function apply(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!signedIn) { onSignIn(); return; }
    if (role === "school_student") { setMessage("School-student accounts can explore career pathways but cannot submit job applications."); return; }
    setSubmitting(true);
    try {
      await submitApplication(selected.id, coverNote.trim() || undefined);
      setCoverNote("");
      setMessage("Application submitted. Track each verified update in Applications.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Application could not be submitted."); }
    finally { setSubmitting(false); }
  }

  return <section className="discover-page">
    <header><div><p className="eyebrow">FAIRMATCH OPPORTUNITY NETWORK</p><h1>Find work worth<br /><em>moving toward.</em></h1><p>Explore verified internships, placements and roles through one accountable workflow.</p></div><div className="discover-stat"><strong>{opportunities.length}</strong><span>open opportunities</span><small>Human decisions · clear status history</small></div></header>
    {message && <p className="governance-message" role="status">{message}</p>}
    <form className="discover-controls" onSubmit={search}>
      <label className="discover-search"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Role, company or location" /></label>
      <label><span>Opportunity type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option><option value="internship">Internships</option><option value="placement">Placements</option><option value="job">Jobs</option></select></label>
      <label><span>Work mode</span><select value={workMode} onChange={(event) => setWorkMode(event.target.value)}><option value="all">All modes</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
      <button type="submit">Search roles</button>
    </form>
    <div className="discover-layout"><div className="discover-results"><div className="section-row"><div><p className="small-label">RESULTS</p><h2>{opportunities.length} relevant opportunities</h2></div><span>Role fit is explained by evidence, never a hidden decision.</span></div>
      {loading ? <p className="empty-state">Loading verified opportunities…</p> : opportunities.length ? <div className="discover-card-grid">{opportunities.map((opportunity) => {
        const match = explainOpportunityMatch({ title: opportunity.title, skills: requirementLabels(opportunity.requirements), location: opportunity.location, work_mode: opportunity.workMode, type: opportunity.type }, profile);
        return <article className={selectedId === opportunity.id ? "active" : ""} key={opportunity.id} onClick={() => setSelectedId(opportunity.id)}>
          <div className="preview-card-top"><span className="status-pill">{opportunity.type}</span>{profile && <small className="match-pill">{match.score}% fit</small>}</div>
          <h3>{opportunity.title}</h3><p>{opportunity.organisationName}</p><p>{opportunity.location ?? "Location shared by employer"} · {opportunity.workMode}</p>
          <div className="application-skill-row">{requirementLabels(opportunity.requirements).slice(0, 4).map((label) => <span key={label}>{label}</span>)}</div>
          <footer><time>Published {new Date(opportunity.publishedAt).toLocaleDateString()}</time><button type="button" onClick={() => setSelectedId(opportunity.id)}>Review</button></footer>
        </article>;
      })}</div> : <p className="empty-state">No opportunities match these filters.</p>}</div>
      <aside className="opportunity-detail-panel">{selected ? <><div className="opportunity-detail-top"><div><span className="status-pill">{selected.type}</span><h2>{selected.title}</h2><p>{selected.organisationName}</p><p>{selected.location ?? "Location shared by employer"} · {selected.workMode}</p></div></div>
        {selectedMatch && profile && <div className="detail-section match-explain-box"><p className="small-label">EXPLAINABLE FIT · {selectedMatch.score}% ({selectedMatch.confidence} confidence)</p>{selectedMatch.strengths.slice(0, 3).map((item) => <p className="evidence-positive" key={item}>+ {item}</p>)}{selectedMatch.gaps.slice(0, 3).map((item) => <p className="evidence-gap" key={item}>△ {item}</p>)}</div>}
        <div className="detail-section"><p className="small-label">ROLE BRIEF</p><p>{selected.description}</p></div><div className="detail-section"><p className="small-label">REQUIREMENTS TO REVIEW</p><div className="application-skill-row">{requirementLabels(selected.requirements).map((label) => <span key={label}>{label}</span>) || <span>Review complete job requirements with the employer</span>}</div></div><form className="opportunity-apply-form" onSubmit={apply}>{role !== "school_student" && <label>Application note (optional)<textarea maxLength={5000} value={coverNote} onChange={(event) => setCoverNote(event.target.value)} placeholder="Why are you interested, and what relevant evidence should the reviewer consider?" /></label>}<div><button disabled={submitting}>{role === "school_student" ? "Explore career relevance" : submitting ? "Submitting…" : "Submit application"}</button></div></form><small className="decision-disclaimer">FairMatch does not make selection decisions. The authorised employer reviews every application.</small></> : <p className="empty-state">Select an opportunity to review its details.</p>}</aside></div>
  </section>;
}
