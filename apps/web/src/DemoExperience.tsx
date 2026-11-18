import { useMemo, useState } from "react";

type DemoRole = "Data analyst" | "Frontend developer" | "Product analyst";

const plans: Record<DemoRole, { required: string[]; verified: string[]; proof: string[]; next: string[]; narrative: string }> = {
  "Data analyst": {
    required: ["SQL", "Excel", "Power BI", "Communication"], verified: ["SQL", "Excel"],
    proof: ["Google Data Analytics Certificate", "Sales dashboard portfolio project"],
    next: ["Add a Power BI dashboard with a short business insight.", "Prepare one STAR story about explaining a data finding.", "Compare this proof against two public analyst roles."],
    narrative: "Your strongest evidence already supports data preparation. The shortest credible next step is to demonstrate visual analysis, then practise communicating it.",
  },
  "Frontend developer": {
    required: ["React", "JavaScript", "Git", "Accessibility"], verified: ["React", "JavaScript", "Git"],
    proof: ["Responsive React portfolio", "Version-controlled coursework project"],
    next: ["Add an accessibility note and keyboard test to one project.", "Write a concise README explaining technical choices.", "Practise one debugging story using STAR."],
    narrative: "Your evidence demonstrates implementation skills. Adding accessible interaction proof makes the profile more complete and easier to review fairly.",
  },
  "Product analyst": {
    required: ["SQL", "Experiment design", "Metrics", "Stakeholder communication"], verified: ["SQL", "Metrics"],
    proof: ["Retention-analysis case study", "Metrics learning certificate"],
    next: ["Add a one-page experiment design to your portfolio.", "Explain a metric trade-off to a non-technical stakeholder.", "Save a target role and compare its public requirements."],
    narrative: "Your evidence shows analytical foundations. The highest-value gap is demonstrating how you turn a metric into a product decision.",
  },
};

export function DemoExperience({ onExit, onOpenWorkspace }: { onExit?: () => void; onOpenWorkspace?: () => void }) {
  const [role, setRole] = useState<DemoRole>("Data analyst");
  const [revealed, setRevealed] = useState(false);
  const plan = plans[role];
  const missing = useMemo(() => plan.required.filter((skill) => !plan.verified.includes(skill)), [plan]);
  const score = Math.round((plan.verified.length / plan.required.length) * 35) + 50;
  return <section className="demo-experience">
    <header className="demo-topbar"><a className="brand" href="#top">fair<span>match</span></a><span>INTERACTIVE DEMO · SAMPLE DATA ONLY</span>{onExit && <button onClick={onExit}>Exit demo</button>}</header>
    <section className="demo-hero"><p className="eyebrow">CAREER INTELLIGENCE, NOT A SOCIAL FEED</p><h1>Show the proof behind<br /><em>every next move.</em></h1><p>This public demo shows FairMatch’s evidence-first career planning: verified proof, visible gaps, a human-led action plan, and no automated hiring decision.</p><div className="demo-role-picker" role="group" aria-label="Demo role">{(Object.keys(plans) as DemoRole[]).map((item) => <button className={role === item ? "active" : ""} onClick={() => { setRole(item); setRevealed(false); }} key={item}>{item}</button>)}</div></section>
    <section className="demo-grid">
      <article className="demo-score"><p className="small-label">EXPLAINABLE READINESS</p><strong>{score}<small>/100</small></strong><span>Evidence-supported, not predictive</span><button onClick={() => setRevealed(true)}>Show how it is calculated</button></article>
      <article className="demo-plan"><p className="small-label">CAREER MOMENTUM PLAN</p><h2>One credible step at a time.</h2><p>{plan.narrative}</p><ol>{plan.next.map((item) => <li key={item}>{item}</li>)}</ol></article>
    </section>
    <section className="demo-proof"><header><div><p className="small-label">PROOF-TO-OPPORTUNITY MAP</p><h2>What a recruiter can understand—without hidden ranking.</h2></div><span>Human review required</span></header><div className="demo-proof-grid"><article><h3>Verified or user-confirmed skills</h3><p>{plan.verified.map((skill) => <b key={skill}>✓ {skill}</b>)}</p><small>Source: candidate-controlled evidence vault</small></article><article><h3>Next evidence to build</h3><p>{missing.map((skill) => <b className="gap" key={skill}>△ {skill}</b>)}</p><small>Gaps are suggestions, not rejection reasons.</small></article><article><h3>Portable evidence</h3><ul>{plan.proof.map((item) => <li key={item}>{item}</li>)}</ul><small>Credentials can later be verified by issuer link.</small></article></div></section>
    {revealed && <section className="demo-explain"><p className="small-label">EXPLAINABILITY PANEL</p><h2>{score}/100 is visible, not magic.</h2><div><span>Profile direction <b>15/15</b></span><span>Location preference <b>10/10</b></span><span>Skills evidence <b>15/20</b></span><span>Requirement match <b>{Math.round((plan.verified.length / plan.required.length) * 35)}/35</b></span></div><p>The score compares only displayed skills and selected public role requirements. It does not use protected traits, private documents, previous employer data, historical hiring outcomes, or external AI.</p></section>}
    <footer className="demo-footer"><strong>Why this is different</strong><p>FairMatch is built around portable evidence, explainable skills-first matching, and a candidate-owned momentum plan—not engagement metrics or opaque ranking.</p>{onOpenWorkspace && <button onClick={onOpenWorkspace}>Open full workspace demo</button>}{onExit && <button onClick={onExit}>Create a real account</button>}</footer>
  </section>;
}
