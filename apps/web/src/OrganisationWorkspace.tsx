import { FormEvent, useEffect, useState } from "react";
import {
  closeOrganisationOpportunity,
  createCollegeCohort,
  createOrganisationOpportunity,
  createPlacementDrive,
  getOrganisationWorkspace,
  publishOrganisationOpportunity,
  reviewOrganisationApplication,
  updatePlacementDriveStatus,
  type OrganisationWorkspace as Workspace,
} from "./lib/api";

type OrganisationRole = "college_coordinator" | "college_admin" | "company_hr" | "company_admin";
type OrganisationView = "overview" | "discover" | "applications" | "profile" | "operations" | "audit";
const companyRoles = new Set<OrganisationRole>(["company_hr", "company_admin"]);

export function OrganisationWorkspace({ role, view = "overview" }: { role: OrganisationRole; view?: OrganisationView }) {
  const isCompany = companyRoles.has(role);
  const [data, setData] = useState<Workspace | null>(null);
  const [message, setMessage] = useState("Loading your protected organisation workspace…");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Company opportunity form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"internship" | "placement" | "job">("job");
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState<"onsite" | "hybrid" | "remote">("hybrid");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [note, setNote] = useState("");

  // College cohort & drive form state
  const [showCohortForm, setShowCohortForm] = useState(false);
  const [cohortName, setCohortName] = useState("");
  const [department, setDepartment] = useState("");
  const [graduationYear, setGraduationYear] = useState(new Date().getFullYear() + 1);
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [showDriveForm, setShowDriveForm] = useState(false);
  const [driveTitle, setDriveTitle] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [driveCohortId, setDriveCohortId] = useState("");
  const [driveDate, setDriveDate] = useState("");
  const [driveNotes, setDriveNotes] = useState("");

  const load = async () => {
    try {
      const next = await getOrganisationWorkspace();
      setData(next);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The organisation workspace could not be loaded.");
    }
  };
  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createOrganisationOpportunity({
        title,
        type,
        location,
        workMode,
        description,
        requirements: requirements.split(",").map((item) => item.trim()).filter(Boolean),
      });
      setTitle(""); setLocation(""); setDescription(""); setRequirements(""); setShowCreate(false);
      setMessage("Draft created. Review it carefully before publishing.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The draft could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function publish(id: string) {
    setBusy(true);
    try {
      await publishOrganisationOpportunity(id);
      setMessage("Opportunity published. Eligible candidates can now discover and apply.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The opportunity could not be published.");
    } finally {
      setBusy(false);
    }
  }

  async function closeOpp(id: string) {
    setBusy(true);
    try {
      await closeOrganisationOpportunity(id);
      setMessage("Opportunity closed. New applications are paused.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The opportunity could not be closed.");
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, status: "shortlisted" | "interview" | "offer" | "rejected") {
    setBusy(true);
    try {
      await reviewOrganisationApplication(id, status, note || undefined);
      setNote("");
      setMessage(`Candidate updated to ${status}. The action and optional note are in the audit trail.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The application could not be reviewed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCohort(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createCollegeCohort({ name: cohortName, department: department || undefined, graduationYear: Number(graduationYear), eligibilityNotes: eligibilityNotes || undefined });
      setCohortName(""); setDepartment(""); setEligibilityNotes(""); setShowCohortForm(false);
      setMessage("Cohort created for placement tracking.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cohort could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDrive(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createPlacementDrive({ cohortId: driveCohortId || undefined, title: driveTitle, employerName, driveDate: driveDate || undefined, notes: driveNotes || undefined });
      setDriveTitle(""); setEmployerName(""); setDriveDate(""); setDriveNotes(""); setShowDriveForm(false);
      setMessage("Placement drive created.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Placement drive could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function changeDriveStatus(driveId: string, status: "planned" | "open" | "completed" | "cancelled") {
    setBusy(true);
    try {
      await updatePlacementDriveStatus(driveId, status);
      setMessage(`Placement drive marked ${status}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Drive status could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="account-loading">{message}</p>;
  if (data.approval !== "active") {
    return (
      <section className="organisation-workspace">
        <header className="candidate-header"><div><p className="eyebrow">ORGANISATION VERIFICATION</p><h1>Your access is<br /><em>under review.</em></h1><p>We separate organisation verification from day-to-day access to protect candidates, colleges and companies.</p></div></header>
        <section className="guidance-card"><div><p className="small-label">CURRENT STATUS</p><h2>{data.organisation?.name ?? "Organisation request"}</h2><p>Your {role.replace(/_/g, " ")} request is pending platform verification. You will receive access only after the organisation and membership are approved.</p></div><div className="guidance-evidence"><span>What happens next</span><p>1. Organisation validation<br />2. Membership approval<br />3. Secure workspace activation</p><small>No candidate or commercial data is visible while approval is pending.</small></div></section>
      </section>
    );
  }

  const cohorts = data.cohorts ?? [];
  const drives = data.drives ?? [];

  return (
    <section className="organisation-workspace">
      <header className="candidate-header">
        <div>
          <p className="eyebrow">{isCompany ? "HIRING OPERATIONS" : "PLACEMENT OPERATIONS"}</p>
          <h1>{data.organisation?.name ?? "Verified organisation"}</h1>
          <p>{isCompany ? "Create roles, review applicants and preserve clear, accountable hiring decisions." : "Manage cohorts and campus placement drives with tenant-scoped accountability."}</p>
        </div>
        <div className="profile-meter">
          <span>{isCompany ? data.opportunities.length : drives.length}</span>
          <strong>{isCompany ? "opportunities" : "placement drives"}</strong>
          <small>{isCompany ? `${data.applications.length} recent candidate records are within your authorised scope.` : `${cohorts.length} active cohort${cohorts.length === 1 ? "" : "s"} configured.`}</small>
          {isCompany ? <button onClick={() => setShowCreate(true)}>Create opportunity</button> : <button onClick={() => setShowDriveForm(true)}>New placement drive</button>}
        </div>
      </header>
      {message && <p className="governance-message">{message}</p>}

      {isCompany && showCreate && (
        <form className="workflow-form" onSubmit={create}>
          <div className="section-row"><div><p className="small-label">NEW OPPORTUNITY</p><h2>Create a publish-ready role.</h2></div><button type="button" className="text-button" onClick={() => setShowCreate(false)}>Close</button></div>
          <label>Role title<input required minLength={2} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Type<select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="job">Job</option><option value="internship">Internship</option><option value="placement">Placement</option></select></label>
          <label>Location<input maxLength={120} value={location} onChange={(event) => setLocation(event.target.value)} /></label>
          <label>Work mode<select value={workMode} onChange={(event) => setWorkMode(event.target.value as typeof workMode)}><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
          <label className="workflow-wide">Description<textarea required minLength={30} maxLength={20000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain the work, expectations and candidate support." /></label>
          <label className="workflow-wide">Requirements<textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="React, Java, communication (separate with commas)" /></label>
          <button disabled={busy}>{busy ? "Creating…" : "Save draft"}</button>
        </form>
      )}

      {!isCompany && showCohortForm && (
        <form className="workflow-form" onSubmit={submitCohort}>
          <div className="section-row"><div><p className="small-label">NEW COHORT</p><h2>Define a graduating cohort.</h2></div><button type="button" className="text-button" onClick={() => setShowCohortForm(false)}>Close</button></div>
          <label>Cohort name<input required minLength={2} maxLength={160} value={cohortName} onChange={(e) => setCohortName(e.target.value)} placeholder="e.g. B.E. Computer Science 2027" /></label>
          <label>Department<input maxLength={120} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Computer Science" /></label>
          <label>Graduation year<input type="number" min={2020} max={2040} required value={graduationYear} onChange={(e) => setGraduationYear(Number(e.target.value))} /></label>
          <label className="workflow-wide">Eligibility notes<textarea maxLength={500} value={eligibilityNotes} onChange={(e) => setEligibilityNotes(e.target.value)} placeholder="Academic or attendance criteria reviewed by placement staff." /></label>
          <button disabled={busy}>{busy ? "Saving…" : "Create cohort"}</button>
        </form>
      )}

      {!isCompany && showDriveForm && (
        <form className="workflow-form" onSubmit={submitDrive}>
          <div className="section-row"><div><p className="small-label">NEW PLACEMENT DRIVE</p><h2>Schedule an employer drive.</h2></div><button type="button" className="text-button" onClick={() => setShowDriveForm(false)}>Close</button></div>
          <label>Drive title<input required minLength={2} maxLength={180} value={driveTitle} onChange={(e) => setDriveTitle(e.target.value)} placeholder="e.g. Campus Software Engineer Drive" /></label>
          <label>Employer name<input required minLength={2} maxLength={160} value={employerName} onChange={(e) => setEmployerName(e.target.value)} placeholder="Partner company name" /></label>
          <label>Target cohort<select value={driveCohortId} onChange={(e) => setDriveCohortId(e.target.value)}><option value="">All eligible cohorts</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.graduationYear})</option>)}</select></label>
          <label>Drive date<input type="date" value={driveDate} onChange={(e) => setDriveDate(e.target.value)} /></label>
          <label className="workflow-wide">Notes<textarea maxLength={1000} value={driveNotes} onChange={(e) => setDriveNotes(e.target.value)} placeholder="Rounds, venue, or preparation instructions." /></label>
          <button disabled={busy}>{busy ? "Creating…" : "Create drive"}</button>
        </form>
      )}

      <div className="organisation-layout">
        <div className="candidate-main">
          {view === "profile" && data.organisation && (
            <section className="pipeline-section">
              <p className="small-label">ORGANISATION PROFILE</p>
              <h2>{data.organisation.name}</h2>
              <div className="account-facts">
                <article><span>Type</span><strong>{data.organisation.kind}</strong></article>
                <article><span>Verification</span><strong>{data.organisation.verificationStatus}</strong></article>
                <article><span>Membership</span><strong>{data.organisation.membershipStatus}</strong></article>
              </div>
            </section>
          )}
          {isCompany ? (
            <>
              <section className="pipeline-section">
                <div className="section-row"><div><p className="small-label">OPPORTUNITIES</p><h2>Roles ready for careful review.</h2></div></div>
                <div className="recent-applications">
                  {data.opportunities.length ? data.opportunities.map((item) => (
                    <article key={item.id}>
                      <div>
                        <span className={`status-pill status-${item.status}`}>{item.status}</span>
                        <h3>{item.title}</h3>
                        <p>{item.type} · {item.location ?? "Location to be confirmed"} · {item.applications} application{item.applications === 1 ? "" : "s"}</p>
                      </div>
                      <div className="applicant-actions">
                        {(item.status === "draft" || item.status === "closed") && <button disabled={busy} onClick={() => publish(item.id)}>{item.status === "closed" ? "Reopen" : "Publish"}</button>}
                        {item.status === "published" && <button className="danger-outline" disabled={busy} onClick={() => closeOpp(item.id)}>Close</button>}
                      </div>
                    </article>
                  )) : (
                    <div className="empty-workflow"><strong>No opportunities yet.</strong><p>Create a draft, validate it internally, then publish it for eligible candidates.</p><button onClick={() => setShowCreate(true)}>Create opportunity</button></div>
                  )}
                </div>
              </section>

              {(view === "overview" || view === "applications") && (
                <section className="applicant-queue">
                  <div className="section-row"><div><p className="small-label">CANDIDATE REVIEW</p><h2>Make every decision explainable.</h2></div><span>{data.applications.length} recent applications</span></div>
                  <label>Decision note (optional, recorded in the audit trail)<input maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Job-related reason for the decision" /></label>
                  {data.applications.length ? data.applications.map((item) => (
                    <article key={item.id} className="applicant-record">
                      <div>
                        <span className={`status-pill status-${item.status}`}>{item.status}</span>
                        <h3>{item.candidate.name}</h3>
                        <p>{item.opportunityTitle} · submitted {new Date(item.submittedAt).toLocaleDateString()}</p>
                        {item.coverNote && <p>{item.coverNote}</p>}
                      </div>
                      <div className="applicant-actions">
                        {item.status === "submitted" && <button className="approve" disabled={busy} onClick={() => review(item.id, "shortlisted")}>Shortlist</button>}
                        {item.status === "shortlisted" && <button className="approve" disabled={busy} onClick={() => review(item.id, "interview")}>Schedule interview</button>}
                        {item.status === "interview" && <button className="approve" disabled={busy} onClick={() => review(item.id, "offer")}>Extend offer</button>}
                        {["submitted", "shortlisted", "interview", "offer"].includes(item.status) && <button className="danger-outline" disabled={busy} onClick={() => review(item.id, "rejected")}>Decline</button>}
                      </div>
                    </article>
                  )) : <p className="empty-state">Applications appear here only after a candidate submits to one of your published opportunities.</p>}
                </section>
              )}
            </>
          ) : (
            <>
              <section className="pipeline-section">
                <div className="section-row">
                  <div><p className="small-label">STUDENT COHORTS</p><h2>Graduating cohorts & eligibility.</h2></div>
                  <button className="text-button" onClick={() => setShowCohortForm(true)}>+ Add cohort</button>
                </div>
                <div className="recent-applications">
                  {cohorts.length ? cohorts.map((cohort) => (
                    <article key={cohort.id}>
                      <div>
                        <span className={`status-pill status-${cohort.status}`}>{cohort.status}</span>
                        <h3>{cohort.name}</h3>
                        <p>{cohort.department ?? "General"} · Class of {cohort.graduationYear}</p>
                        {cohort.eligibilityNotes && <small>{cohort.eligibilityNotes}</small>}
                      </div>
                    </article>
                  )) : (
                    <div className="empty-workflow"><strong>No cohorts yet.</strong><p>Create your first graduating cohort to organize placement drives.</p><button onClick={() => setShowCohortForm(true)}>Create cohort</button></div>
                  )}
                </div>
              </section>

              <section className="applicant-queue">
                <div className="section-row">
                  <div><p className="small-label">PLACEMENT DRIVES</p><h2>Coordinate campus hiring drives.</h2></div>
                  <button className="text-button" onClick={() => setShowDriveForm(true)}>+ New drive</button>
                </div>
                {drives.length ? drives.map((drive) => (
                  <article key={drive.id} className="applicant-record">
                    <div>
                      <span className={`status-pill status-${drive.status}`}>{drive.status}</span>
                      <h3>{drive.title}</h3>
                      <p>{drive.employerName}{drive.cohortName ? ` · ${drive.cohortName}` : ""}{drive.driveDate ? ` · ${drive.driveDate}` : ""}</p>
                      {drive.notes && <p>{drive.notes}</p>}
                    </div>
                    <div className="applicant-actions">
                      {drive.status === "planned" && <button className="approve" disabled={busy} onClick={() => changeDriveStatus(drive.id, "open")}>Open drive</button>}
                      {drive.status === "open" && <button className="approve" disabled={busy} onClick={() => changeDriveStatus(drive.id, "completed")}>Mark completed</button>}
                      {(drive.status === "planned" || drive.status === "open") && <button className="danger-outline" disabled={busy} onClick={() => changeDriveStatus(drive.id, "cancelled")}>Cancel</button>}
                    </div>
                  </article>
                )) : <p className="empty-state">No placement drives scheduled yet.</p>}
              </section>
            </>
          )}
        </div>
        <aside className="org-guardrails">
          <p className="small-label">WORKSPACE GUARDRAILS</p>
          <h3>Access follows verified responsibility.</h3>
          <ul>
            <li>Only verified, active organisation members can see these records.</li>
            <li>Candidate information is limited to an authorised application workflow.</li>
            <li>Every publish, drive and review action is recorded.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
