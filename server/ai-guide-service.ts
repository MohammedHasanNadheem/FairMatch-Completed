import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { database } from "./database";
import { readEnvironment } from "./env";
import { HttpError } from "./http";
import type { TokenClaims } from "./identity";

export type AiContext = "career_guidance" | "opportunity_match" | "application_support" | "cohort_insight" | "recruiting_support" | "platform_operations";
export type GuidedAnswer = { provider?: "gemini" | "fallback"; answer: string; whyShown: string[]; strengths: string[]; gaps: string[]; confidence: "low" | "medium" | "high"; limitations: string; nextActions: string[]; followUpPrompts: string[]; humanReviewRecommended: boolean };
type ProfileRow = RowDataPacket & { headline: string | null; location: string | null; skills: unknown };
const buckets = new Map<string, number[]>();
function safe(value: string) { return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]").replace(/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, "[phone removed]").replace(/\s{3,}/g, " ").trim().slice(0, 4000); }
function allowed(role: string, context: AiContext) { if (["career_guidance", "opportunity_match", "application_support"].includes(context)) return ["school_student", "college_student", "job_seeker"].includes(role); if (context === "cohort_insight") return ["college_coordinator", "college_admin"].includes(role); if (context === "recruiting_support") return ["company_hr", "company_admin"].includes(role); return role === "platform_admin"; }
function rateAllowed(id: string) { const now = Date.now(); const values = (buckets.get(id) ?? []).filter((time) => now - time < 60_000); if (values.length >= 8) return false; values.push(now); buckets.set(id, values); return true; }
function skills(value: unknown) { try { const list = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string").slice(0, 20) : []; } catch { return []; } }

function planFor(context: AiContext, question: string, headline: string | null, profileSkills: string[]) {
  const target = headline ? `your saved direction, “${safe(headline)}”` : "the role or outcome you want to pursue";
  const skillNote = profileSkills.length ? ` Your recorded skills include ${profileSkills.slice(0, 4).join(", ")}.` : "";
  const lower = question.toLowerCase();
  if (/medical|diagnos|prescri|legal advice|lawsuit|tax return|investment|crypto|password|one-time code/.test(lower)) return {
    answer: "FairMatch Guide is for career, placement, recruitment and platform-workflow questions. This question needs a qualified professional or the appropriate secure service, so I cannot provide a recommendation.",
    nextActions: ["Use an appropriate qualified professional or official service.", "Do not share passwords, one-time codes or sensitive personal information here.", "Return with a career, placement, recruitment or FairMatch workflow question."],
    followUpPrompts: ["Create an interview preparation plan.", "What profile evidence should I improve?"],
  };
  if (context === "career_guidance") {
    if (/resume|cv|profile|linkedin/.test(lower)) return {
      answer: `For “${question.slice(0, 220)}”, make your profile evidence-led: put ${target} in the headline, then show skills through projects, outcomes and tools you can explain honestly.${skillNote}`,
      nextActions: ["Choose one target role and compare your headline against a real role description.", "Add two outcome-focused project or experience bullets.", "Remove unsupported skill claims and prepare a short example for every retained skill."],
      followUpPrompts: ["Help me turn a project into a strong profile bullet.", "What evidence is missing for my target role?"],
    };
    if (/interview|question|introduce yourself/.test(lower)) return {
      answer: `For “${question.slice(0, 220)}”, prepare three short STAR examples that connect a situation, your action and an observable result to ${target}.${skillNote}`,
      nextActions: ["Select one teamwork, one problem-solving and one learning example.", "Write each example in 90 seconds or less.", "Practice with a mentor and ask them to challenge unclear claims."],
      followUpPrompts: ["Create practice interview questions for my target role.", "Help me structure a STAR example."],
    };
    return {
      answer: `For “${question.slice(0, 220)}”, turn the goal into an evidence-first career plan around ${target}.${skillNote}`,
      nextActions: ["Set one measurable seven-day career goal.", "Complete one job-relevant project, course module or informational conversation.", "Record what you learned and update the profile evidence that supports it."],
      followUpPrompts: ["Turn this into a one-week plan.", "What profile evidence is missing?"],
    };
  }
  if (context === "opportunity_match") return {
    answer: `For “${question.slice(0, 220)}”, compare the opportunity requirements with verifiable evidence, not assumptions.${skillNote}`,
    nextActions: ["List the three most important requirements from the role.", "Mark each as supported, developing or missing based on your profile evidence.", "Apply only with an accurate profile and ask about any unclear requirement."],
    followUpPrompts: ["Explain the gap between my skills and this role.", "Create questions to ask before applying."],
  };
  if (context === "application_support") return {
    answer: `For “${question.slice(0, 220)}”, keep the application specific and truthful: connect one relevant example to the role, explain the result, and avoid claims you cannot discuss in an interview.${skillNote}`,
    nextActions: ["Tailor the opening to the role and organisation.", "Add one concrete project, placement or work example.", "Proofread dates, names and evidence before submitting."],
    followUpPrompts: ["Help me create an honest application checklist.", "Prepare interview questions for this application."],
  };
  if (context === "cohort_insight") return {
    answer: `For “${question.slice(0, 220)}”, use aggregate, non-identifying placement signals to decide where human support is needed; do not rank students or make decisions from protected traits.`,
    nextActions: ["Define the cohort outcome and the job-relevant evidence to review.", "Segment only by programme or readiness evidence, never sensitive traits.", "Offer an opt-in workshop or human support route and measure its result."],
    followUpPrompts: ["Create a fair placement-readiness workshop plan.", "Suggest aggregate placement metrics."],
  };
  if (context === "recruiting_support") return {
    answer: `For “${question.slice(0, 220)}”, make the hiring process structured and human-led: evaluate the same job-relevant evidence for every candidate and record the reason for each decision.`,
    nextActions: ["Define a small, role-specific scorecard before reviewing candidates.", "Use the same structured questions and evidence standard for each candidate.", "Record a human reviewer, evidence and rationale for every stage change."],
    followUpPrompts: ["Create a structured interview plan.", "Improve this role description for clarity and fairness."],
  };
  return {
    answer: `For “${question.slice(0, 220)}”, use a least-privilege, auditable workflow: assign a clear owner, require human approval for high-impact actions, and record the outcome without exposing unnecessary user data.`,
    nextActions: ["Identify the minimum access and data needed for the task.", "Document the owner, approval point and rollback action.", "Review the resulting audit event and any unresolved exception."],
    followUpPrompts: ["Create a governance checklist.", "Design an incident triage workflow."],
  };
}

async function callGeminiGuide(
  context: AiContext,
  question: string,
  role: string,
  headline: string | null,
  profileSkills: string[],
): Promise<{ answer: string; nextActions: string[]; followUpPrompts: string[] } | null> {
  const { GEMINI_API_KEY, GEMINI_MODEL } = readEnvironment();
  const apiKey = GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (/medical|diagnos|prescri|legal advice|lawsuit|tax return|investment|crypto|password|one-time code/i.test(question)) {
    return null;
  }

  const model = GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = [
    `You are FairMatch Guide, an explainable, human-led career and placement assistant.`,
    `User role: ${role}. Guidance mode: ${context}.`,
    headline ? `Saved direction: ${safe(headline)}.` : "No saved career target yet.",
    profileSkills.length ? `Recorded skills: ${profileSkills.join(", ")}.` : "No recorded skills yet.",
    `Rules: Never make hiring/admission decisions, never invent facts, keep advice practical and concise.`,
    `Return strict JSON with keys: "answer" (string, 2-4 sentences), "nextActions" (array of 3 short strings), "followUpPrompts" (array of 2 short strings).`,
    `User question: ${question}`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const reply = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 700,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!reply.ok) return null;
    const data = await reply.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    const parsed = JSON.parse(rawText) as {
      answer?: unknown;
      nextActions?: unknown;
      followUpPrompts?: unknown;
    };
    if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
    return {
      answer: parsed.answer.trim().slice(0, 2000),
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 4)
        : [],
      followUpPrompts: Array.isArray(parsed.followUpPrompts)
        ? parsed.followUpPrompts.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
        : [],
    };
  } catch {
    return null;
  }
}

export async function guidedAdvice(actor: TokenClaims, input: { message: string; context: AiContext }) {
  if (!allowed(actor.role, input.context)) throw new HttpError(403, "assistant_mode_forbidden", "This guidance mode is not available for your role.");
  if (!rateAllowed(actor.sub)) throw new HttpError(429, "ai_rate_limited", "Please wait a minute before requesting more guidance.");
  const question = safe(input.message); if (!question) throw new HttpError(422, "invalid_question", "Ask a career or workflow question without contact details.");
  const [rows] = await database().execute<ProfileRow[]>("SELECT headline, location, skills FROM profiles WHERE user_id = ? LIMIT 1", [actor.sub]);
  const profile = rows[0]; const profileSkills = skills(profile?.skills ?? null);
  const gaps = [!profile?.headline && "No career target is recorded yet.", !profile?.location && "No preferred location is recorded yet.", !profileSkills.length && "No skills are recorded yet."].filter((item): item is string => Boolean(item));

  const geminiPlan = await callGeminiGuide(input.context, question, actor.role, profile?.headline ?? null, profileSkills);
  const plan = geminiPlan ?? planFor(input.context, question, profile?.headline ?? null, profileSkills);

  const answer: GuidedAnswer = {
    provider: geminiPlan ? "gemini" : "fallback",
    answer: plan.answer,
    nextActions: plan.nextActions.length ? plan.nextActions : ["Review your profile evidence and next steps."],
    followUpPrompts: plan.followUpPrompts,
    whyShown: [
      profile?.headline ? `Saved direction used: ${safe(profile.headline)}.` : "No saved career target was used.",
      geminiPlan
        ? "Generated via server-side Gemini API with PII stripped and minimal profile fields."
        : "Generated via FairMatch deterministic Guided Mode with minimal profile fields.",
    ],
    strengths: profileSkills.length ? [`Recorded skills: ${profileSkills.slice(0, 4).join(", ")}.`] : [],
    gaps,
    confidence: profile?.headline && profileSkills.length ? "medium" : "low",
    limitations: "Guided Mode does not use live job-market data, private records, personal circumstances or sensitive attributes. It does not decide who should be hired, admitted or selected.",
    humanReviewRecommended: true,
  };
  await database().execute("INSERT INTO audit_events (id, actor_id, action, entity_type, metadata) VALUES (?, ?, 'guided_advice.requested', 'ai_exchange', CAST(? AS JSON))", [randomUUID(), actor.sub, JSON.stringify({ context: input.context, provider: geminiPlan ? "gemini" : "deterministic" })]);
  return answer;
}
