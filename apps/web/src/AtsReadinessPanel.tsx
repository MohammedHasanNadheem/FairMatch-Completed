import { FormEvent, useState } from "react";
import { requestAtsReadiness, type AtsReadiness } from "./lib/api";

const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30);

export function AtsReadinessPanel() {
  const [targetRole, setTargetRole] = useState("");
  const [requirements, setRequirements] = useState("");
  const [result, setResult] = useState<AtsReadiness | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function assess(event: FormEvent) {
    event.preventDefault();
    const trimmedRole = targetRole.trim();
    const parsedReqs = split(requirements);
    if (!trimmedRole || parsedReqs.length === 0) {
      setMessage("Enter both a target role and at least one comma-separated requirement to calculate ATS readiness.");
      setResult(null);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      setResult(await requestAtsReadiness(trimmedRole, parsedReqs));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Readiness could not be calculated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ats-panel" aria-label="Explainable ATS readiness">
      <div className="ats-panel-heading">
        <div>
          <p className="small-label">EXPLAINABLE ATS READINESS</p>
          <h2>See what your profile communicates.</h2>
          <p>Compare your recorded skills against a specific role. FairMatch scores only real inputs and never fabricates results.</p>
        </div>
        <span className="ats-advisory">Gemini + Rubric</span>
      </div>
      <form className="ats-form" onSubmit={assess}>
        <label>
          Target role
          <input
            required
            minLength={2}
            maxLength={160}
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value)}
            placeholder="Example: Front-end developer"
          />
        </label>
        <label>
          Role requirements
          <textarea
            required
            minLength={2}
            maxLength={1500}
            value={requirements}
            onChange={(event) => setRequirements(event.target.value)}
            placeholder="React, JavaScript, Git, communication"
          />
          <small>Required: comma-separated skills or requirements from the job description.</small>
        </label>
        <button disabled={loading || !targetRole.trim() || !requirements.trim()}>
          {loading ? "Analyzing readiness…" : "Check readiness"}
        </button>
      </form>
      {message && <p className="governance-message" role="status">{message}</p>}
      {result && (
        <div className="ats-result">
          <div className="ats-score">
            <strong>{result.score}</strong>
            <span>/100</span>
            <p>{result.confidence} confidence</p>
          </div>
          <div className="ats-details">
            <p className="ats-disclaimer">{result.disclaimer}</p>
            <div className="ats-criteria">
              {result.criteria.map((criterion) => (
                <div key={criterion.label}>
                  <div><strong>{criterion.label}</strong><span>{criterion.points}/{criterion.maximum}</span></div>
                  <p>{criterion.explanation}</p>
                </div>
              ))}
            </div>
            {result.matchedSkills.length > 0 && <p className="skill-line"><b>Matched:</b> {result.matchedSkills.join(", ")}</p>}
            {result.missingSkills.length > 0 && <p className="skill-line missing"><b>Needs evidence:</b> {result.missingSkills.join(", ")}</p>}
            <div className="ats-next">
              <strong>Recommended next steps</strong>
              <ul>{result.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
