import { useState, type MouseEvent } from "react";
import type { WorkspaceRole, WorkspaceView } from "./WorkspaceShell";

type PreviewRole = Exclude<WorkspaceRole, "platform_admin">;
type Metric = [string, string, string];

const candidates = new Set<PreviewRole>(["school_student", "college_student", "job_seeker"]);
const companies = new Set<PreviewRole>(["company_hr", "company_admin"]);
const roleLabel: Record<PreviewRole, string> = {
  school_student: "Career explorer",
  college_student: "College student",
  job_seeker: "Experienced job seeker",
  college_coordinator: "Placement coordinator",
  college_admin: "College administrator",
  company_hr: "Company recruiter",
  company_admin: "Company administrator",
};

const roleMission: Record<PreviewRole, string> = {
  school_student: "Age-safe pathway exploration, activities and counsellor-supported planning.",
  college_student: "Internship discovery, placement readiness and campus cohort workflows.",
  job_seeker: "Experience-led job search, application tracking and interview preparation.",
  college_coordinator: "Cohort operations, student interventions and employer-drive execution.",
  college_admin: "Institution governance, placement outcomes, access and programme oversight.",
  company_hr: "Opportunity publishing, evidence-based candidate review and interview operations.",
  company_admin: "Hiring governance, team access, subscriptions and organisation-wide reporting.",
};

const rolePulse: Record<PreviewRole, Metric> = {
  school_student: ["Pathways explored", "4", "Guardian-safe guidance"],
  college_student: ["Placement readiness", "78%", "Cohort verified"],
  job_seeker: ["Search momentum", "6 days", "3 target roles"],
  college_coordinator: ["Students supported", "482", "12 active drives"],
  college_admin: ["Placement coverage", "81%", "6 programmes"],
  company_hr: ["Candidates in review", "34", "SLA 1.8 days"],
  company_admin: ["Hiring teams", "7", "92% audit notes"],
};

const viewCopy: Record<WorkspaceView, [string, string, string]> = {
  overview: ["PERSONALISED COMMAND CENTRE", "Today, priorities and progress—connected.", "Profile evidence, deadlines and workflow changes become clear next actions."],
  discover: ["DISCOVERY & MATCHING", "Find the right next move with reasons.", "Search, filter, save and compare without hiding gaps or inventing fit."],
  applications: ["PIPELINE & ACTIONS", "Every active workflow in one place.", "Track stages, owners, dates, evidence and pending actions without spreadsheets."],
  insights: ["EXPLAINABLE INTELLIGENCE", "Measure progress and reveal bottlenecks.", "Every metric explains what changed and which human action should follow."],
  assistant: ["FAIRMATCH AI", "Practical AI with visible evidence and limits.", "Basic guidance is free; paid plans unlock higher usage and advanced workspaces."],
  profile: ["TRUSTED RECORD", "Accurate information, controlled visibility.", "Structured records power matching while sharing remains deliberate and auditable."],
  account: ["ACCOUNT & PRIVACY", "Security, consent and data rights in one place.", "Control sessions, notifications, visibility, exports, corrections and deletion."],
  operations: ["OPERATIONS", "Connected operational control.", "Approvals, exceptions and service health stay visible to authorised administrators."],
  audit: ["AUDIT", "Every consequential action leaves evidence.", "Review access changes, workflow decisions and data actions with clear ownership."],
};

const candidateMetrics: Record<WorkspaceView, Metric[]> = {
  overview: [["Profile readiness", "78%", "+12% this month"], ["Saved next moves", "6", "2 closing soon"], ["Active workflows", "4", "1 needs action"]],
  discover: [["Recommended", "18", "Evidence-ranked"], ["Saved searches", "3", "Daily alerts active"], ["Strong matches", "7", "70%+ verified fit"]],
  applications: [["In progress", "4", "Across 3 stages"], ["Interviews", "2", "Next: Thursday"], ["Response rate", "63%", "+8% this month"]],
  insights: [["Readiness", "78", "5 evidence areas"], ["Skills verified", "8", "3 assessments"], ["Momentum", "6 days", "Goal: 5 days"]],
  assistant: [["Free AI usage", "12 / 30", "Resets 01 Sep"], ["Guidance plans", "3", "2 completed"], ["Human reviews", "1", "Counsellor requested"]],
  profile: [["Completion", "78%", "3 sections remain"], ["Verified evidence", "11", "Skills + documents"], ["Visibility", "Private", "Shared on application"]],
  account: [["Active sessions", "2", "Laptop + phone"], ["Saved consents", "3", "Review any time"], ["Data requests", "0", "No open requests"]],
  operations: [["Open actions", "0", "Candidate access"], ["Approvals", "0", "Not applicable"], ["Exceptions", "0", "No exceptions"]],
  audit: [["Recorded actions", "14", "Private history"], ["Exports", "0", "No recent export"], ["Security events", "0", "No alerts"]],
};

const organisationMetrics: Record<WorkspaceView, Metric[]> = {
  overview: [["Active workflows", "12", "4 need attention"], ["Response SLA", "1.8d", "Within target"], ["Team activity", "86%", "Last 7 days"]],
  discover: [["Published", "8", "2 close this week"], ["Drafts", "3", "1 needs approval"], ["Reach", "1,248", "Eligible profiles"]],
  applications: [["Awaiting review", "34", "Oldest: 3 days"], ["Shortlisted", "12", "6 interviews pending"], ["Offers / outcomes", "5", "67% accepted"]],
  insights: [["Conversion", "18%", "Apply to interview"], ["Median response", "1.8d", "Target < 2 days"], ["Decision notes", "92%", "Target: 100%"]],
  assistant: [["AI usage", "84 / 250", "Pilot allowance"], ["Saved playbooks", "6", "Shared with team"], ["Human approvals", "100%", "No automation"]],
  profile: [["Status", "Verified", "Identity reviewed"], ["Active members", "7", "2 administrators"], ["Data quality", "94%", "1 section remains"]],
  account: [["Plan", "Pilot", "Controlled access"], ["Audit retention", "90d", "Upgrade available"], ["Security alerts", "0", "MFA recommended"]],
  operations: [["Open approvals", "4", "Oldest: 2 days"], ["Tenant exceptions", "0", "Isolation healthy"], ["Service checks", "9 / 9", "Operational"]],
  audit: [["Recorded actions", "186", "Last 30 days"], ["Decision notes", "92%", "Target: 100%"], ["Exports", "4", "All attributable"]],
};

function Metrics({ rows }: { rows: Metric[] }) {
  return <div className="role-preview-metrics">{rows.map(([label, value, note]) => <article key={label}><strong>{value}</strong><span>{label}</span><small>{note}</small></article>)}</div>;
}

function Actions({ school = false, company = false }: { school?: boolean; company?: boolean }) {
  const rows = school ? [
    ["Compare two pathways", "Use interests, subjects and practical activities."],
    ["Try one small project", "Record what felt engaging and worth repeating."],
    ["Review with a trusted adult", "Share evidence with a teacher or counsellor."],
  ] : company ? [
    ["Review 4 waiting applications", "Oldest candidate has waited three days."],
    ["Schedule 6 interviews", "Shortlisted candidates need available slots."],
    ["Complete 2 decision notes", "Audit evidence is required before progression."],
  ] : [
    ["Finish the strongest application", "The Data Analyst Intern role closes in two days."],
    ["Prepare for Thursday’s interview", "Use the structured evidence question plan."],
    ["Add one verified skill", "Complete the SQL assessment for stronger matching."],
  ];
  return <div className="preview-action-list">{rows.map(([title, text], index) => <button type="button" className="preview-action-row" key={title}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{title}</strong><p>{text}</p></div><span>→</span></button>)}</div>;
}

function Overview({ role }: { role: PreviewRole }) {
  const school = role === "school_student";
  const company = companies.has(role);
  return <div className="preview-two-column"><section className="preview-panel"><div className="preview-section-heading"><div><p className="small-label">NEXT BEST ACTIONS</p><h2>{school ? "Build a safe exploration plan" : company ? "Hiring work requiring attention" : candidates.has(role) ? "Keep your search moving" : "Placement work requiring attention"}</h2></div><span>Updated now</span></div><Actions school={school} company={company} /></section><aside className="preview-panel preview-accent"><p className="small-label">THIS WEEK</p><h2>{candidates.has(role) ? "Momentum plan" : "Service standard"}</h2><div className="preview-week"><span className="done">M</span><span className="done">T</span><span className="done">W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><strong>{candidates.has(role) ? "3 of 5 focused actions complete" : "1.8 day median response"}</strong><p>FairMatch connects every screen so the next action is never isolated.</p></aside></div>;
}

function CandidateDiscovery({ school }: { school: boolean }) {
  const [query, setQuery] = useState("");
  const rows = school ? [
    ["Product design & engineering", "92% interest alignment", "Design · Maths · Practical projects"],
    ["Environmental science", "84% interest alignment", "Science · Research · Sustainability"],
    ["Digital media & communication", "76% interest alignment", "Writing · Visual thinking · Technology"],
  ] : [
    ["Data Analyst Intern", "86% evidence match", "Chennai · Hybrid · ₹20k/month"],
    ["Graduate Software Engineer", "78% evidence match", "Bengaluru · On-site · ₹6–8 LPA"],
    ["Business Intelligence Associate", "73% evidence match", "Remote · Full time · ₹5–7 LPA"],
  ];
  const visibleRows = rows.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase()));
  return <section className="preview-panel"><div className="preview-toolbar"><label className="preview-search">⌕ <input aria-label={school ? "Search pathways" : "Search opportunities"} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={school ? "Search pathways, subjects or activities" : "Search role, skill, company or location"} /></label><button type="button">Filters · 4</button><button type="button">Saved searches · 3</button></div><div className="preview-card-grid">{visibleRows.map(([title, match, detail], index) => <article key={title}><div className="preview-card-top"><span>{school ? "PATHWAY" : index ? "JOB" : "INTERNSHIP"}</span><button type="button" aria-label={`Save ${title}`}>☆</button></div><h3>{title}</h3><p>{detail}</p><div className="preview-match"><strong>{match}</strong><span><i style={{ width: `${86 - index * 9}%` }} /></span></div><ul><li>✓ Evidence supporting this match</li><li>△ One gap to verify before acting</li></ul><footer><button type="button">View explanation</button><button type="button">{school ? "Add to plan" : "Review & apply"}</button></footer></article>)}</div>{!visibleRows.length && <p className="preview-empty-search">No matching results. Clear the search or change the terms.</p>}</section>;
}

function OrganisationDiscovery({ company }: { company: boolean }) {
  const rows = company ? [["Data Analyst Intern", "Published", "126", "34", "Aug 24"], ["Graduate Software Engineer", "Published", "284", "58", "Aug 29"], ["Product Designer", "Draft", "—", "—", "Needs approval"]] : [["2026 Engineering Cohort", "Active", "482", "78%", "12 drives"], ["Final-year Commerce", "Active", "216", "71%", "7 drives"], ["Alumni Career Return", "Draft", "84", "—", "Needs review"]];
  return <section className="preview-panel"><div className="preview-section-heading"><div><p className="small-label">{company ? "OPPORTUNITY MANAGEMENT" : "COHORT MANAGEMENT"}</p><h2>{company ? "Create, publish and improve roles" : "Organise students and employer access"}</h2></div><button>{company ? "Create opportunity" : "Create cohort"}</button></div><PreviewTable headings={[company ? "Role" : "Cohort", "Status", company ? "Views" : "Students", company ? "Applicants" : "Ready", "Next milestone"]} rows={rows} /></section>;
}

function PreviewTable({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return <div className="preview-table"><div className="preview-table-head">{headings.map((item) => <span key={item}>{item}</span>)}</div>{rows.map((row) => <article key={row[0]}>{row.map((cell, index) => <span className={index === 1 || index === 3 ? "status" : ""} key={`${cell}-${index}`}>{cell}</span>)}<button>Review</button></article>)}</div>;
}

function CandidatePipeline({ school }: { school: boolean }) {
  const columns = school ? [
    ["Considering · 3", "Environmental engineering", "Compare courses and daily work", "Ask a professional"],
    ["Trying · 2", "Design challenge", "Create a low-cost water filter", "Due Friday"],
    ["Reflected · 4", "Intro coding project", "Enjoyed logic; needs practice", "Teacher reviewed"],
  ] : [
    ["Saved · 6", "BI Associate", "Role fit 73% · closes Aug 24", "Tailor resume"],
    ["Applied · 4", "Data Analyst Intern", "Viewed by employer yesterday", "Follow up Aug 20"],
    ["Interview · 2", "Graduate Engineer", "Technical round · Thu 10:30", "Plan ready"],
    ["Offer · 1", "Product Operations Intern", "Decision due Aug 22", "Compare offer"],
  ];
  return <section className="preview-panel"><div className="preview-section-heading"><div><p className="small-label">{school ? "EXPLORATION BOARD" : "APPLICATION TRACKER"}</p><h2>{school ? "Ideas move from curiosity to reflection" : "Saved → applied → interview → offer"}</h2></div><button>{school ? "Add activity" : "Add external application"}</button></div><div className="preview-kanban">{columns.map(([heading, title, text, next]) => <div key={heading}><strong>{heading}</strong><article><b>{title}</b><p>{text}</p><small>{next}</small></article></div>)}</div></section>;
}

function OrganisationPipeline({ company }: { company: boolean }) {
  const rows = company ? [["A. Kumar", "Data Analyst Intern", "86%", "Awaiting review", "2h"], ["S. Priya", "Graduate Engineer", "81%", "Shortlisted", "1d"], ["R. Harish", "Data Analyst Intern", "74%", "Interview", "Thu"], ["M. Aisha", "Product Designer", "69%", "Needs evidence", "3d"]] : [["Engineering cohort", "Data Analyst Intern", "126 eligible", "34 applied", "78% ready"], ["Commerce cohort", "Business Associate", "84 eligible", "22 applied", "71% ready"], ["Alumni cohort", "Returnship", "41 eligible", "9 applied", "6 reviews"]];
  return <section className="preview-panel"><div className="preview-section-heading"><div><p className="small-label">{company ? "CANDIDATE REVIEW" : "PLACEMENT ACTIVITY"}</p><h2>{company ? "Evidence before decisions" : "Cohort progress without spreadsheets"}</h2></div><div><button>Filter · 3</button><button>Export</button></div></div><PreviewTable headings={[company ? "Candidate" : "Cohort", "Opportunity", company ? "Fit" : "Eligibility", company ? "Stage" : "Applications", company ? "Waiting" : "Readiness"]} rows={rows} /></section>;
}

function Insights({ organisation }: { organisation: boolean }) {
  if (organisation) return <div className="preview-two-column"><section className="preview-panel"><p className="small-label">CONVERSION FUNNEL</p><h2>Outcomes with accountable reasons</h2><div className="preview-funnel">{[["Eligible / reached", 100, "1,248"], ["Applications", 62, "386"], ["Shortlisted", 35, "128"], ["Interviews", 21, "76"], ["Offers / placed", 12, "42"]].map(([label, width, value]) => <div key={String(label)} style={{ width: `${width}%` }}><span>{label}</span><strong>{value}</strong></div>)}</div></section><aside className="preview-panel"><p className="small-label">QUALITY SIGNALS</p><h2>What needs attention</h2><div className="preview-signal"><strong>92%</strong><span>Decisions include reasons</span></div><div className="preview-signal warning"><strong>3.2d</strong><span>Slowest response segment</span></div><div className="preview-signal"><strong>0</strong><span>Cross-tenant incidents</span></div></aside></div>;
  return <div className="preview-two-column"><section className="preview-panel"><p className="small-label">READINESS BREAKDOWN</p><h2>Progress backed by evidence</h2><div className="preview-bars">{[["Profile clarity", 88], ["Verified skills", 72], ["Application quality", 81], ["Interview readiness", 64], ["Network & research", 48]].map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{value}%</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div></section><aside className="preview-panel"><p className="small-label">EXPLAINED BOTTLENECK</p><h2>Interview readiness is next</h2><p>Applications receive responses, but structured examples for problem-solving and teamwork remain incomplete.</p><Actions /></aside></div>;
}

function AiPreview({ organisation }: { organisation: boolean }) {
  return <div className="preview-ai-layout"><aside className="preview-panel"><p className="small-label">ACCESS & USAGE</p><h2>{organisation ? "Pilot workspace" : "Free AI"}</h2><div className="preview-usage-ring"><strong>{organisation ? "84" : "12"}</strong><span>of {organisation ? "250" : "30"}<br />used this month</span></div><p>Every answer shows evidence, gaps, confidence, limitations and next actions.</p><button className="preview-upgrade">Compare paid plans</button><small>Payments activate after pricing, tax and refund terms are approved.</small></aside><section className="preview-panel preview-chat"><div className="preview-chat-message user">How should I improve the next stage of this workflow?</div><div className="preview-chat-message assistant"><span>✦ FairMatch AI</span><p>Start with the largest verified constraint, then choose one action whose outcome can be reviewed by a person.</p><div><strong>Why this is shown</strong><small>Based on current workflow evidence and the selected role.</small></div><div><strong>Limitation</strong><small>This guidance cannot make an admission, hiring or access decision.</small></div></div><div className="preview-prompt-row"><button>Explain my next step</button><button>Build a 7-day plan</button><button>Show evidence gaps</button></div></section></div>;
}

function ProfilePreview({ organisation }: { organisation: boolean }) {
  const sections = organisation ? [["Public identity", "Name, location, website and verification", "Complete"], ["Team & permissions", "7 active members · least privilege", "Manage"], ["Operating standards", "SLA, fairness and decision-note rules", "Review"], ["Plan & usage", "Pilot with measured entitlements", "View plan"], ["Integrations", "Email, calendar and exports", "Configure"]] : [["Career direction", "Target roles, locations and work preferences", "Complete"], ["Skills & assessments", "8 skills · 3 verified assessments", "Review"], ["Education", "College and qualification details", "Complete"], ["Projects & experience", "4 evidence records", "Add outcome"], ["Documents", "2 private resumes · 3 certificates", "Manage"]];
  return <div className="preview-profile-layout"><section className="preview-panel"><div className="preview-profile-head"><span>{organisation ? "FM" : "NH"}</span><div><h2>{organisation ? "Verified organisation" : "Mohammed Hasan Nadheem"}</h2><p>{organisation ? "Connected team workspace" : "Aspiring full-stack developer · Chennai"}</p></div><strong>{organisation ? "Verified" : "78% complete"}</strong></div><div className="preview-profile-sections">{sections.map(([title, text, state]) => <article key={title}><div><strong>{title}</strong><p>{text}</p></div><button>{state}</button></article>)}</div></section><aside className="preview-panel preview-accent"><p className="small-label">TRUST & VISIBILITY</p><h2>{organisation ? "Controls operational" : "Private by default"}</h2><p>✓ Identity verified</p><p>✓ Access boundary active</p><p>✓ Consequential actions audited</p><p>△ Administrator MFA recommended</p></aside></div>;
}

function AccountPreview({ organisation }: { organisation: boolean }) {
  return <div className="preview-two-column"><section className="preview-panel"><p className="small-label">SECURITY & NOTIFICATIONS</p><h2>Account controls</h2><div className="preview-settings-list"><article><div><strong>Password & sign-in</strong><p>2 active sessions · security history available</p></div><button>Manage</button></article><article><div><strong>Notification preferences</strong><p>Applications, interviews, alerts and security</p></div><button>Configure</button></article><article><div><strong>{organisation ? "Team and plan" : "AI access plan"}</strong><p>{organisation ? "Pilot · 7 active members" : "Free · 30 AI requests per month"}</p></div><button>{organisation ? "View plan" : "Upgrade"}</button></article></div></section><aside className="preview-panel"><p className="small-label">PRIVACY RIGHTS</p><h2>Your data, your request</h2><div className="preview-request-grid"><button>Export my data<span>Download a reviewed copy</span></button><button>Correct my data<span>Request an amendment</span></button><button>Delete my account<span>Reviewed irreversible action</span></button><button>Withdraw AI consent<span>Stop external processing</span></button></div></aside></div>;
}

function Surface({ role, view }: { role: PreviewRole; view: WorkspaceView }) {
  const candidate = candidates.has(role);
  const company = companies.has(role);
  if (view === "overview") return <Overview role={role} />;
  if (view === "discover") return candidate ? <CandidateDiscovery school={role === "school_student"} /> : <OrganisationDiscovery company={company} />;
  if (view === "applications") return candidate ? <CandidatePipeline school={role === "school_student"} /> : <OrganisationPipeline company={company} />;
  if (view === "insights") return <Insights organisation={!candidate} />;
  if (view === "assistant") return <AiPreview organisation={!candidate} />;
  if (view === "profile") return <ProfilePreview organisation={!candidate} />;
  if (view === "account") return <AccountPreview organisation={!candidate} />;
  return <Overview role={role} />;
}

export function AdminRolePreview({ role, view, onNavigate }: { role: PreviewRole; view: WorkspaceView; onNavigate?: (view: WorkspaceView) => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [eyebrow, title, description] = viewCopy[view];
  const baseMetrics = (candidates.has(role) ? candidateMetrics : organisationMetrics)[view];
  const metrics = [rolePulse[role], ...baseMetrics.slice(1)];
  function openAction(event: MouseEvent<HTMLElement>) {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    const label = button.getAttribute("aria-label") || button.textContent?.trim() || "Portal action";
    const normalised = label.toLowerCase();
    const nextView: WorkspaceView = /apply|application|interview|activity|review 4|schedule/.test(normalised)
      ? "applications"
      : /skill|profile|document|evidence|complete|manage/.test(normalised)
        ? "profile"
        : /explanation|gap|insight|metrics/.test(normalised)
          ? "insights"
          : /plan|ai|next step|7-day/.test(normalised)
            ? "assistant"
            : view;
    if (nextView !== view && onNavigate) {
      onNavigate(nextView);
      setNotice(`Opening ${nextView.replace(/_/g, " ")} for ${label}.`);
      return;
    }
    setNotice(`${label} is updated in this interactive preview.`);
  }
  return <section className="role-preview-page" aria-label={`${roleLabel[role]} ${view} preview`} onClick={openAction}>
    <header><div><p className="eyebrow">{eyebrow}</p><h1>{roleLabel[role]}: {title}</h1><p>{roleMission[role]} {description}</p></div><div className="preview-context"><span>{roleLabel[role]}</span><small>{view.replace(/_/g, " ")}</small><b>Interactive owner preview</b></div></header>
    <Metrics rows={metrics} />
    <div className="preview-surface"><Surface role={role} view={view} /></div>
    {notice && <p className="auth-callback-notice success" role="status">{notice}</p>}
    <footer><strong>Safe owner preview</strong><span>Controls are interactive with illustrative records. Sign in as the real role to write protected production data.</span></footer>
  </section>;
}
