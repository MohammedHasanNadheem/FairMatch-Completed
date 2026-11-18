import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

type Assessment = {
  id: string;
  title: string;
  description: string;
  skill_family: string;
  duration_minutes: number;
  passing_score: number;
};
type Attempt = {
  id: string;
  assessment_id: string;
  status: "in_progress" | "completed" | "expired";
  score: number | null;
  passed: boolean | null;
  started_at: string;
  completed_at: string | null;
};
type Question = {
  id: string;
  position: number;
  prompt: string;
  options: string[];
  skillTag: string;
};
type Session = {
  attemptId: string;
  title: string;
  durationMinutes: number;
  startedAt: string;
  questions: Question[];
};
type Result = {
  score: number;
  passed: boolean;
  passingScore: number;
  breakdown: {
    questionId: string;
    skillTag: string;
    correct: boolean;
    explanation: string;
  }[];
};

export function assessmentProgress(
  total: number,
  answers: Record<string, number>,
) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((Object.keys(answers).length / total) * 100));
}

export function CandidateAssessments() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("Loading secure assessments…");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    const [assessmentResult, attemptResult] = await Promise.all([
      supabase
        .from("skill_assessments")
        .select(
          "id, title, description, skill_family, duration_minutes, passing_score",
        )
        .eq("published", true)
        .order("title"),
      supabase
        .from("assessment_attempts")
        .select(
          "id, assessment_id, status, score, passed, started_at, completed_at",
        )
        .order("started_at", { ascending: false }),
    ]);
    if (assessmentResult.error) {
      setMessage(
        assessmentResult.error.code === "42P01"
          ? "Apply migration 014 to activate secure skill assessments."
          : assessmentResult.error.message,
      );
      return;
    }
    setAssessments((assessmentResult.data ?? []) as Assessment[]);
    if (!attemptResult.error)
      setAttempts((attemptResult.data ?? []) as Attempt[]);
    setMessage("");
  }
  useEffect(() => {
    void load();
  }, []);

  async function start(assessment: Assessment) {
    if (
      !supabase ||
      !window.confirm(
        `Start ${assessment.title}? The ${assessment.duration_minutes}-minute timer begins immediately.`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    setResult(null);
    setAnswers({});
    const { data, error } = await supabase.rpc("start_skill_assessment", {
      target_assessment_id: assessment.id,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSession(data as Session);
  }

  async function submit() {
    if (!supabase || !session) return;
    if (Object.keys(answers).length !== session.questions.length) {
      setMessage("Answer every question before submitting.");
      return;
    }
    setBusy(true);
    setMessage("Scoring securely…");
    const { data, error } = await supabase.rpc("submit_skill_assessment", {
      target_attempt_id: session.attemptId,
      submitted_answers: answers,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setResult(data as Result);
    setSession(null);
    setMessage("");
    await load();
  }

  const progress = useMemo(
    () => assessmentProgress(session?.questions.length ?? 0, answers),
    [answers, session],
  );

  if (session)
    return (
      <section className="assessment-session">
        <header>
          <div>
            <p className="small-label">SECURE ASSESSMENT</p>
            <h2>{session.title}</h2>
            <p>
              Answer independently. Responses are scored on the server; answer
              keys are never delivered to the browser.
            </p>
          </div>
          <div className="assessment-progress">
            <strong>{progress}%</strong>
            <span>answered</span>
          </div>
        </header>
        <div className="assessment-question-list">
          {session.questions.map((question) => (
            <fieldset key={question.id}>
              <legend>
                <span>{String(question.position).padStart(2, "0")}</span>
                {question.prompt}
              </legend>
              <small>{question.skillTag}</small>
              {question.options.map((option, index) => (
                <label
                  key={option}
                  className={answers[question.id] === index ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === index}
                    onChange={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: index,
                      }))
                    }
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
          ))}
          {message && <p className="governance-message">{message}</p>}
          <footer>
            <span>
              {session.durationMinutes} minutes total · one submission
            </span>
            <button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "Scoring…" : "Submit for secure scoring"}
            </button>
          </footer>
        </div>
      </section>
    );

  return (
    <section className="candidate-assessments">
      <header>
        <div>
          <p className="small-label">VERIFIED SKILL EVIDENCE</p>
          <h2>Demonstrate judgement—not just keywords.</h2>
          <p>
            FairMatch assessments add platform-scored evidence to your profile.
            Scores inform explanations but never make automatic hiring
            decisions.
          </p>
        </div>
        <aside>
          <strong>Assessment integrity</strong>
          <span>Server-side scoring</span>
          <span>Time and retake limits</span>
          <span>Visible limitations</span>
        </aside>
      </header>
      {message && <p className="governance-message">{message}</p>}
      {result && (
        <article
          className={`assessment-result ${result.passed ? "passed" : "review"}`}
        >
          <div>
            <span>Latest result</span>
            <strong>{result.score}%</strong>
            <small>Pass mark {result.passingScore}%</small>
          </div>
          <div>
            <h3>
              {result.passed
                ? "Verified evidence earned"
                : "Review the reasoning and try later"}
            </h3>
            {result.breakdown.map((item) => (
              <p key={item.questionId}>
                {item.correct ? "✓" : "○"} <strong>{item.skillTag}:</strong>{" "}
                {item.explanation}
              </p>
            ))}
          </div>
        </article>
      )}
      <div className="assessment-grid">
        {assessments.length ? (
          assessments.map((assessment) => {
            const latest = attempts.find(
              (attempt) => attempt.assessment_id === assessment.id,
            );
            return (
              <article key={assessment.id}>
                <div>
                  <span className="status-pill">{assessment.skill_family}</span>
                  <h3>{assessment.title}</h3>
                  <p>{assessment.description}</p>
                </div>
                <dl>
                  <div>
                    <dt>Duration</dt>
                    <dd>{assessment.duration_minutes} min</dd>
                  </div>
                  <div>
                    <dt>Pass mark</dt>
                    <dd>{assessment.passing_score}%</dd>
                  </div>
                  <div>
                    <dt>Latest</dt>
                    <dd>
                      {latest?.score != null ? `${latest.score}%` : "Not taken"}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => start(assessment)}
                >
                  {latest ? "Retake assessment" : "Start assessment"}
                </button>
                <small>Maximum three starts in a rolling 30-day window.</small>
              </article>
            );
          })
        ) : (
          <div className="profile-empty">
            <strong>No assessments available for this account.</strong>
            <p>
              Published assessments appear here when they match your candidate
              stage.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
