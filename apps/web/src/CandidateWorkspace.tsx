import { useEffect, useMemo, useState } from "react";
import { getCandidateProfile, listApplications, listEvidence, type ApiApplication, type CandidateEvidence, type CandidateProfile } from "./lib/api";

type CandidateRole = "school_student" | "college_student" | "job_seeker";

const copy: Record<CandidateRole, { label: string; title: string; description: string; browse: string }> = {
  school_student: { label: "School career exploration", title: "Explore interests before choosing a track.", description: "Build safe curiosity through projects, subjects and counsellor conversations without premature ranking.", browse: "Explore pathways" },
  college_student: { label: "College placement workspace", title: "Turn campus preparation into verified offers.", description: "Connect your evidence vault, ATS readiness and internship or placement applications in one place.", browse: "Browse internships & placements" },
  job_seeker: { label: "Experienced career workspace", title: "Target roles where your proof stands out.", description: "Track active applications, interview stages and verified evidence with full privacy control.", browse: "Browse open roles" },
};

function readiness(profile: CandidateProfile | null) {
  if (!profile) return 0;
  return Math.round(([profile.fullName, profile.headline, profile.location, profile.skills.length].filter(Boolean).length / 4) * 100);
}

export function CandidateWorkspace({ role, onBrowse, onEditProfile, onApplications }: { role: CandidateRole; onBrowse: () => void; onEditProfile: () => void; onApplications?: () => void }) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [applications, setApplications] = useState<ApiApplication[]>([]);
  const [evidence, setEvidence] = useState<CandidateEvidence[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const details = copy[role];

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getCandidateProfile(),
      role === "school_student" ? Promise.resolve({ items: [] as ApiApplication[] }) : listApplications(),
      listEvidence().catch(() => [] as CandidateEvidence[]),
    ])
      .then(([nextProfile, result, nextEvidence]) => {
        if (mounted) {
          setProfile(nextProfile);
          setApplications(result.items);
          setEvidence(nextEvidence);
        }
      })
      .catch((reason: Error) => { if (mounted) setError(reason.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [role]);

  const statusCounts = useMemo(() => Object.fromEntries(["submitted", "shortlisted", "interview", "offer"].map((status) => [status, applications.filter((item) => item.status === status).length])), [applications]);
  const nextAction = !profile?.headline ? "Add a career headline" : !profile.skills.length ? "Add your skills" : !profile.location ? "Set a preferred location" : role === "school_student" ? "Explore career pathways & record a project" : "Find opportunities with a clear fit";

  return <section className="candidate-workspace" aria-label="Candidate workspace">
    <header className="candidate-header">
      <div><p className="eyebrow">{details.label.toUpperCase()}</p><h1>{details.title}</h1><p>{details.description}</p></div>
      <div className="profile-meter"><span>{loading ? "—" : `${readiness(profile)}%`}</span><strong>Profile readiness</strong><small>{evidence.length} evidence item{evidence.length === 1 ? "" : "s"} saved privately.</small><button onClick={onEditProfile}>Improve profile</button></div>
    </header>
    {error && <p className="governance-message">{error}</p>}
    <div className="candidate-layout">
      <div className="candidate-main">
        <section className="guidance-card">
          <div><p className="small-label">NEXT BEST STEP</p><h2>{nextAction}</h2><p>FairMatch shows what is missing and why. It does not make career, hiring or admission decisions for you.</p></div>
          <div className="guidance-evidence"><span>Evidence currently used</span><p>{profile?.headline ? `Target: ${profile.headline}` : "No target is saved yet"}<br />{profile?.skills.length ? `${profile.skills.length} skill${profile.skills.length === 1 ? "" : "s"} recorded` : "No skills recorded"}</p><small>AI guidance will always identify its source, confidence and limitations.</small></div>
        </section>

        {role === "school_student" ? (
          <section className="pipeline-section">
            <div className="section-row"><div><p className="small-label">EXPLORATION MILESTONES</p><h2>Build curiosity without pressure.</h2></div><button className="text-button" onClick={onBrowse}>{details.browse} →</button></div>
            <div className="pipeline-metrics">
              <div><strong>{loading ? "—" : profile?.skills.length ?? 0}</strong><span>Interests & skills</span></div>
              <div><strong>{loading ? "—" : evidence.length}</strong><span>Projects & certificates</span></div>
              <div><strong>Private</strong><span>Default visibility</span></div>
            </div>
            <div className="empty-workflow">
              <strong>Under-18 privacy protection active</strong>
              <p>School accounts cannot submit job applications directly and remain private until guardian-approved eligibility changes.</p>
              <button onClick={onEditProfile}>Record a school project or skill</button>
            </div>
          </section>
        ) : (
          <section className="pipeline-section">
            <div className="section-row"><div><p className="small-label">{role === "college_student" ? "CAMPUS PLACEMENT PIPELINE" : "ACTIVE JOB PIPELINE"}</p><h2>Progress without losing context.</h2></div><button className="text-button" onClick={onBrowse}>{details.browse} →</button></div>
            <div className="pipeline-metrics">{["submitted", "shortlisted", "interview", "offer"].map((status) => <div key={status}><strong>{loading ? "—" : statusCounts[status]}</strong><span>{status}</span></div>)}</div>
            {applications.length ? <div className="recent-applications">{applications.slice(0, 5).map((application) => <article key={application.id} onClick={onApplications ?? onBrowse} style={{ cursor: "pointer" }}><div><span className={`status-pill status-${application.status}`}>{application.status}</span><h3>{application.opportunity.title}</h3><p>{application.opportunity.organisationName} · {application.opportunity.location ?? "Location to be confirmed"}</p></div><span aria-hidden="true">→</span></article>)}</div> : <div className="empty-workflow"><strong>No applications yet.</strong><p>When you apply, FairMatch preserves the opportunity, your note and every later status change in one private timeline.</p><button onClick={onBrowse}>{details.browse}</button></div>}
          </section>
        )}
      </div>
      <aside className="candidate-side">
        <p className="small-label">YOUR WORKSPACE</p>
        <button onClick={onEditProfile}><span>01</span> {role === "school_student" ? "Record skills & projects" : "Build profile & ATS"} <b>→</b></button>
        <button onClick={onBrowse}><span>02</span> {role === "school_student" ? "Explore pathways" : "Discover opportunities"} <b>→</b></button>
        {role !== "school_student" && <button onClick={onApplications ?? onBrowse}><span>03</span> Track applications <b>→</b></button>}
        <div className="privacy-note"><strong>Privacy is a product feature.</strong><p>Recruiters see data only when you choose to submit it with an application or enable discoverability.</p></div>
      </aside>
    </div>
  </section>;
}
