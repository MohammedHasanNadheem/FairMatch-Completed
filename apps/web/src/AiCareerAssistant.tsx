import { FormEvent, useMemo, useState } from "react";
import type { WorkspaceRole } from "./WorkspaceShell";
import { requestGuidedAdvice, type GuidedAnswer } from "./lib/api";

type AiContext = "career_guidance" | "opportunity_match" | "application_support" | "cohort_insight" | "recruiting_support" | "platform_operations";
type ContextOption = { id: AiContext; label: string; description: string };
type Turn = { id: string; question: string; answer: GuidedAnswer };
type AiEntitlement = { planCode: string; planName: string; status: string; monthlyLimit: number; usedThisMonth: number; remaining: number; renewsAt: string; upgradeAvailable: boolean };

const roleCopy: Record<WorkspaceRole, { eyebrow: string; title: string; description: string; prompts: string[] }> = {
  school_student: { eyebrow: "AGE-AWARE CAREER EXPLORATION", title: "Explore possibilities without being boxed in.", description: "Use safe, practical questions to understand careers before committing to a path.", prompts: ["Create a four-week career exploration plan.", "What questions should I ask a career counsellor?", "How can I explore science and design careers?"] },
  college_student: { eyebrow: "PLACEMENT GUIDE", title: "Move from profile to placement with evidence.", description: "Improve your preparation and explain each next step using your own recorded evidence.", prompts: ["What should I improve first for my target roles?", "Create an interview preparation plan.", "Explain the gaps in my placement readiness."] },
  job_seeker: { eyebrow: "CAREER COPILOT", title: "Make the next move with a reason.", description: "Turn your experience, profile and goals into an honest, focused search plan.", prompts: ["Create a focused 30-day job-search plan.", "Which profile gaps should I fix before applying?", "Help me position my experience honestly."] },
  college_coordinator: { eyebrow: "PLACEMENT OPERATIONS GUIDE", title: "Turn signals into human-led action.", description: "Plan fair placement interventions without exposing unrelated student data.", prompts: ["Design a fair placement-readiness workshop.", "Create a placement cohort intervention checklist.", "What evidence should a coordinator review first?"] },
  college_admin: { eyebrow: "COLLEGE OUTCOMES GUIDE", title: "Improve the system, not just the dashboard.", description: "Create transparent placement programmes and governance checks.", prompts: ["Create a placement governance checklist.", "Suggest fair college outcome metrics.", "How should we audit coordinator access?"] },
  company_hr: { eyebrow: "FAIR HIRING GUIDE", title: "Structure better hiring conversations.", description: "Build job-relevant, accountable recruiting operations while keeping decisions human.", prompts: ["Create a structured interview plan for a software intern.", "Improve a role description for clarity and fairness.", "What evidence should we record during candidate review?"] },
  company_admin: { eyebrow: "HIRING GOVERNANCE GUIDE", title: "Make hiring operations consistent.", description: "Design clear controls and standards without automated selection decisions.", prompts: ["Create a hiring governance checklist.", "Suggest fair recruiting pipeline metrics.", "How should administrators audit HR decisions?"] },
  platform_admin: { eyebrow: "PLATFORM OPERATIONS GUIDE", title: "Reason about governance without exposing users.", description: "Build access, audit and incident workflows with human approval at each high-impact step.", prompts: ["Create a weekly platform governance checklist.", "How should we review elevated-access requests?", "Design an incident triage workflow."] },
};

export function assistantContextsFor(role: WorkspaceRole): ContextOption[] {
  if (role === "school_student") return [{ id: "career_guidance", label: "Career pathways", description: "Interests, subjects and safe experiments" }];
  if (role === "college_student" || role === "job_seeker") return [{ id: "career_guidance", label: "Career strategy", description: "Direction, strengths and development plan" }, { id: "opportunity_match", label: "Role fit", description: "Evidence, gaps and questions to verify" }, { id: "application_support", label: "Application support", description: "Authentic applications and interview preparation" }];
  if (role === "college_coordinator" || role === "college_admin") return [{ id: "cohort_insight", label: "Cohort insight", description: "Aggregate, non-identifying placement support" }];
  if (role === "company_hr" || role === "company_admin") return [{ id: "recruiting_support", label: "Fair hiring support", description: "Structured, human-led recruiting operations" }];
  return [{ id: "platform_operations", label: "Platform operations", description: "Access, audit and governance workflows" }];
}

export function buildYouthGuidance(question: string): GuidedAnswer {
  return { answer: `Start with a small exploration cycle for “${question}”: choose one field, learn what people actually do, try one practical activity, and discuss what you noticed with a trusted adult before making a decision.`, whyShown: ["You selected the protected under-18 experience.", "This response uses only the words in this question; no profile or resume data left FairMatch."], strengths: ["You are exploring before relying on a single label."], gaps: ["Subjects, interests and local study options need human verification."], confidence: "low", limitations: "This is general education support. It does not know your marks, personal circumstances, local admissions rules or counsellor assessment.", nextActions: ["List three subjects or activities you enjoy.", "Try one small project or informational interview.", "Review your observations with a parent, guardian, teacher or counsellor."], followUpPrompts: ["Help me compare two career fields safely.", "Create questions for a career counsellor."], humanReviewRecommended: true };
}

export function entitlementFrom(value: unknown): AiEntitlement | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<AiEntitlement>;
  if (typeof item.planCode !== "string" || typeof item.monthlyLimit !== "number") return null;
  return { planCode: item.planCode, planName: typeof item.planName === "string" ? item.planName : item.planCode, status: typeof item.status === "string" ? item.status : "active", monthlyLimit: Math.max(1, item.monthlyLimit), usedThisMonth: Math.max(0, Number(item.usedThisMonth ?? 0)), remaining: Math.max(0, Number(item.remaining ?? 0)), renewsAt: typeof item.renewsAt === "string" ? item.renewsAt : "", upgradeAvailable: item.upgradeAvailable === true };
}

export function AiCareerAssistant({ role }: { role: WorkspaceRole }) {
  const copy = roleCopy[role];
  const contexts = useMemo(() => assistantContextsFor(role), [role]);
  const [context, setContext] = useState<AiContext>(contexts[0].id);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (nextQuestion.length < 2 || loading) {
      setError("Enter a question (at least 2 characters) to ask FairMatch Guide.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const answer = await requestGuidedAdvice(nextQuestion, context);
      setTurns((current) => [...current, { id: crypto.randomUUID(), question: nextQuestion, answer }]);
      setQuestion("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "FairMatch Guide could not complete this request.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="ai-workspace"><header className="ai-hero"><div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.description}</p></div><aside><span className="ai-live-mark">✦</span><div><strong>Gemini Guided Mode</strong><small>FairMatch API · explainable · human-led</small></div></aside></header><div className="ai-command-layout"><aside className="ai-control-panel"><div><p className="small-label">GUIDANCE MODE</p>{contexts.map((option) => <button key={option.id} className={option.id === context ? "active" : ""} onClick={() => setContext(option.id)}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div><div className="ai-privacy-card"><strong>Private by design</strong><p>Personal identifiers (emails and phone numbers) are stripped before generating guidance.</p><strong>Human decisions remain required</strong><p>FairMatch cannot make hiring, admission, career or disciplinary decisions.</p></div></aside><main className="ai-conversation">{!turns.length && <section className="ai-starter"><p className="small-label">START WITH A REAL QUESTION</p><h2>What are you trying to decide or improve?</h2><div>{copy.prompts.map((prompt) => <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt}<span>↗</span></button>)}</div></section>}{turns.map((turn) => <article className="ai-turn" key={turn.id}><div className="ai-question"><span>You</span><p>{turn.question}</p></div><div className="ai-answer"><header><div><span className="ai-live-mark">✦</span><strong>FairMatch Guide · {turn.answer.provider === "gemini" ? "Gemini Live" : "Rule Fallback (add AIza... GEMINI_API_KEY)"}</strong></div><div className={`confidence confidence-${turn.answer.confidence}`}><span>{turn.answer.confidence} evidence</span></div></header><p className="ai-answer-copy">{turn.answer.answer}</p><div className="ai-evidence-grid"><section><p className="small-label">WHY THIS IS SHOWN</p><ul>{turn.answer.whyShown.map((item) => <li key={item}>{item}</li>)}</ul></section><section><p className="small-label">EVIDENCE & GAPS</p>{turn.answer.strengths.map((item) => <p className="evidence-positive" key={item}>+ {item}</p>)}{turn.answer.gaps.map((item) => <p className="evidence-gap" key={item}>△ {item}</p>)}</section></div><section className="ai-next-actions"><p className="small-label">NEXT ACTIONS</p><ol>{turn.answer.nextActions.map((item) => <li key={item}>{item}</li>)}</ol></section><footer><p><strong>Limitations:</strong> {turn.answer.limitations}</p>{turn.answer.humanReviewRecommended && <span>Human review recommended</span>}</footer></div></article>)}<form className="ai-composer" onSubmit={submit}><div><textarea aria-label="Ask FairMatch Guide" required minLength={2} maxLength={4000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask for a practical next step, evidence review or preparation plan…" /><button disabled={loading || question.trim().length < 2}>{loading ? "Preparing…" : "Ask Guide"}<span>↑</span></button></div><p>Guidance is not a substitute for a qualified counsellor, recruiter, educator or administrator.</p>{error && <p className="ai-error" role="alert">{error}</p>}</form></main></div></section>;
}
