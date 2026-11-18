import { useEffect, useState } from "react";
import { getRoleInsights, type RoleInsightsResponse } from "./lib/api";
import type { WorkspaceRole } from "./WorkspaceShell";

type Metric = { label: string; value: number; unit?: string; detail: string; tone: "lime" | "clay" | "plum" | "sage" };
type FunnelStep = { label: string; value: number };
type InsightState = { title: string; summary: string; metrics: Metric[]; funnel: FunnelStep[]; action: { title: string; reason: string; steps: string[] }; quality: string[] };

export function deriveCandidateNextAction(readiness: number, saved: number, applications: number, interviews: number, offers: number) {
  if (readiness < 75) return { title: "Complete the evidence in your profile", reason: `Profile readiness is ${readiness}%. Matching confidence improves when skills, location, education and experience are recorded.`, steps: ["Add a clear career headline", "Record skills you can demonstrate", "Add education, projects or experience"] };
  if (saved === 0) return { title: "Build a focused opportunity shortlist", reason: "Your profile is ready, but no opportunity has been saved for comparison.", steps: ["Review the highest-fit opportunities", "Check missing skills and location", "Save two or three roles worth preparing for"] };
  if (applications === 0) return { title: "Convert preparation into one thoughtful application", reason: `${saved} saved opportunit${saved === 1 ? "y is" : "ies are"} waiting for action.`, steps: ["Choose the strongest evidence match", "Verify requirements and deadline", "Submit a tailored application note"] };
  if (interviews === 0) return { title: "Improve application-to-interview conversion", reason: `${applications} application${applications === 1 ? "" : "s"} recorded with no interview yet.`, steps: ["Review fit gaps in submitted roles", "Strengthen proof for recurring skills", "Use FairMatch Guide for interview-readiness planning"] };
  if (offers === 0) return { title: "Turn interview evidence into an offer", reason: `${interviews} interview${interviews === 1 ? "" : "s"} recorded and no offer yet.`, steps: ["Review interview outcomes", "Prepare evidence-based examples", "Clarify role expectations and next steps"] };
  return { title: "Evaluate the offer, not only the title", reason: `${offers} offer${offers === 1 ? "" : "s"} require a deliberate decision.`, steps: ["Compare learning, compensation and location", "Verify deadlines and conditions", "Record your decision in FairMatch"] };
}

const csvCell = (value: string | number) => { const text = String(value); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"`; };
export function buildInsightCsv(role: WorkspaceRole, insight: InsightState) { const rows: Array<Array<string | number>> = [["FairMatch role intelligence report"], ["Role", role], ["Generated at", new Date().toISOString()], ["Report", insight.title], [], ["Metrics"], ["Metric", "Value", "Unit", "Definition"], ...insight.metrics.map((metric) => [metric.label, metric.value, metric.unit ?? "count", metric.detail]), [], ["Outcome funnel"], ["Stage", "Visible records"], ...insight.funnel.map((step) => [step.label, step.value]), [], ["Recommended action", insight.action.title], ["Reason", insight.action.reason], ...insight.action.steps.map((step, index) => [`Step ${index + 1}`, step]), [], ["Measurement notes"], ...insight.quality.map((note) => [note])]; return rows.map((row) => row.map(csvCell).join(",")).join("\r\n"); }

const copy: Record<WorkspaceRole, InsightState> = {
  school_student: { title: "Career exploration progress", summary: "Start with safe experiments and verified conversations, rather than a permanent label.", metrics: [], funnel: [], action: deriveCandidateNextAction(0, 0, 0, 0, 0), quality: ["No automated career decisions", "School profiles remain private"] },
  college_student: { title: "Placement readiness", summary: "Your profile and application records become measurable after you add evidence and submit opportunities.", metrics: [], funnel: [], action: deriveCandidateNextAction(0, 0, 0, 0, 0), quality: ["No hidden matching decisions", "Human employer review required"] },
  job_seeker: { title: "Job-search progress", summary: "Use recorded applications and profile evidence to focus the next action.", metrics: [], funnel: [], action: deriveCandidateNextAction(0, 0, 0, 0, 0), quality: ["No invented outcomes", "Human hiring decisions only"] },
  college_coordinator: { title: "Placement operations", summary: "Cohort and placement drive metrics from your verified college workspace.", metrics: [], funnel: [], action: { title: "Coordinate active cohorts and drives", reason: "Track cohort readiness and scheduled campus drives without exposing private student records.", steps: ["Confirm active cohorts", "Open scheduled placement drives", "Review aggregate outcomes"] }, quality: ["Aggregate data only", "No automated student decisions"] },
  college_admin: { title: "College oversight", summary: "Governance metrics across approved coordinator, cohort and drive activity.", metrics: [], funnel: [], action: { title: "Review placement drive outcomes", reason: "Monitor cohort coverage and employer drive completion.", steps: ["Verify cohort eligibility rules", "Review open drives", "Export aggregate report"] }, quality: ["Tenant scoped", "Human governance required"] },
  company_hr: { title: "Hiring intelligence", summary: "Live opportunity and applicant pipeline metrics for your verified company.", metrics: [], funnel: [], action: { title: "Keep applicant reviews timely and explainable", reason: "Every stage transition is recorded with a job-related reason.", steps: ["Review submitted applications", "Schedule structured interviews", "Record clear decision notes"] }, quality: ["No automated selection", "Every decision needs a recorded human reason"] },
  company_admin: { title: "Hiring oversight", summary: "Manage verified roles and audit candidate decisions at the organisation level.", metrics: [], funnel: [], action: { title: "Audit hiring pipeline velocity", reason: "Ensure open roles and candidate decisions remain accountable.", steps: ["Review published opportunities", "Check interview-to-offer conversion", "Export pipeline CSV"] }, quality: ["Tenant scoped", "Human hiring decisions only"] },
  platform_admin: { title: "Platform intelligence", summary: "Live account, organisation approval and audit metrics across FairMatch.", metrics: [], funnel: [], action: { title: "Review pending access", reason: "Elevated access must be approved before any organisation record becomes visible.", steps: ["Review organisation identity", "Approve or reject the request", "Retain the audit trail"] }, quality: ["No automatic elevated access", "Audit trail required"] },
};

export function RoleInsights({ role }: { role: WorkspaceRole }) {
  const base = copy[role];
  const [live, setLive] = useState<RoleInsightsResponse | null>(null);

  useEffect(() => {
    getRoleInsights().then(setLive).catch(() => undefined);
  }, [role]);

  const isCandidate = role === "school_student" || role === "college_student" || role === "job_seeker";
  const action = live && isCandidate
    ? deriveCandidateNextAction(live.readiness, live.openOpportunities ?? 0, live.applications, live.interviews, live.offers)
    : base.action;

  const insight: InsightState = {
    ...base,
    metrics: live?.metrics ?? base.metrics,
    funnel: live?.funnel ?? base.funnel,
    action,
  };

  function downloadCsv() {
    const csv = buildInsightCsv(role, insight);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fairmatch-${role}-insights.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const maxFunnel = Math.max(1, ...insight.funnel.map((step) => step.value));

  return (
    <section className="role-insights">
      <header className="candidate-header">
        <div>
          <p className="eyebrow">ROLE INTELLIGENCE</p>
          <h1>{insight.title}</h1>
          <p>{insight.summary}</p>
        </div>
        <div className="profile-meter">
          <span>{live ? `${live.readiness}%` : "—"}</span>
          <strong>Workflow readiness</strong>
          <small>Calculated strictly from your authorised FairMatch records.</small>
          <button type="button" onClick={downloadCsv}>Export CSV report</button>
        </div>
      </header>

      {insight.metrics.length > 0 && (
        <div className="application-kpis">
          {insight.metrics.map((metric) => (
            <article key={metric.label} title={metric.detail}>
              <strong>{metric.value}{metric.unit === "%" ? "%" : ""}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>
      )}

      {insight.funnel.length > 0 && (
        <section className="pipeline-section">
          <p className="small-label">OUTCOME FUNNEL</p>
          <h2>Pipeline progression</h2>
          <div className="insight-funnel">
            {insight.funnel.map((step) => (
              <div className="insight-funnel-row" key={step.label}>
                <span>{step.label}</span>
                <div className="insight-funnel-bar"><i style={{ width: `${Math.round((step.value / maxFunnel) * 100)}%` }} /></div>
                <strong>{step.value}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="guidance-card">
        <div>
          <p className="small-label">RECOMMENDED ACTION</p>
          <h2>{insight.action.title}</h2>
          <p>{insight.action.reason}</p>
        </div>
        <div className="guidance-evidence">
          <span>Measurement principles</span>
          <p>{insight.quality.join(" · ")}</p>
          <small>All metrics are derived directly from verified MySQL records.</small>
        </div>
      </section>

      <section className="pipeline-section">
        <p className="small-label">NEXT STEPS</p>
        <ol>{insight.action.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      </section>
    </section>
  );
}
