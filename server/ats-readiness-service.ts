import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { database } from "./database";
import { readEnvironment } from "./env";
import { HttpError } from "./http";
import type { TokenClaims } from "./identity";

type ProfileRow = RowDataPacket & { headline: string | null; location: string | null; skills: unknown; preferences: unknown };
export type ReadinessCriterion = { label: string; points: number; maximum: number; explanation: string };
export type AtsReadiness = {
  score: number;
  confidence: "low" | "medium" | "high";
  targetRole: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  criteria: ReadinessCriterion[];
  recommendations: string[];
  disclaimer: string;
};

const candidateRoles = ["school_student", "college_student", "job_seeker"];
const normalise = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9+#.\- ]/g, "").replace(/\s+/g, " ");
const unique = (values: string[]) => [...new Map(values.map((value) => [normalise(value), value.trim()])).values()].filter(Boolean);
function stringList(value: unknown) { try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
function targets(value: unknown) { try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray((parsed as { targetRoles?: unknown } | null)?.targetRoles) ? (parsed as { targetRoles: unknown[] }).targetRoles.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }

/**
 * Transparent profile-readiness indicator. It is deliberately not a hiring
 * score: it never uses protected traits, historic outcomes, or opaque models.
 */
export function calculateAtsReadiness(profile: { headline?: string | null; location?: string | null; skills?: string[]; targetRoles?: string[] }, input: { targetRole?: string; requirements?: string[] }): AtsReadiness {
  const skills = unique(profile.skills ?? []);
  const requirements = unique(input.requirements ?? []).slice(0, 30);
  const skillKeys = new Set(skills.map(normalise));
  const matchedSkills = requirements.filter((skill) => skillKeys.has(normalise(skill)));
  const missingSkills = requirements.filter((skill) => !skillKeys.has(normalise(skill)));
  const criteria: ReadinessCriterion[] = [];
  criteria.push({ label: "Clear career direction", points: profile.headline?.trim() ? 15 : 0, maximum: 15, explanation: profile.headline?.trim() ? "A career headline is saved." : "Add a concise career headline." });
  criteria.push({ label: "Location preference", points: profile.location?.trim() ? 10 : 0, maximum: 10, explanation: profile.location?.trim() ? "A preferred location is saved." : "Add a location or remote preference." });
  const skillPoints = skills.length >= 5 ? 20 : skills.length >= 3 ? 15 : skills.length ? 7 : 0;
  criteria.push({ label: "Skills evidence", points: skillPoints, maximum: 20, explanation: skills.length ? `${skills.length} skill${skills.length === 1 ? "" : "s"} recorded; add relevant tools and strengths.` : "No skills are recorded." });
  const targetRole = input.targetRole?.trim() || profile.targetRoles?.[0]?.trim() || null;
  const roleMentioned = Boolean(targetRole && [profile.headline ?? "", ...(profile.targetRoles ?? [])].some((item) => normalise(item).includes(normalise(targetRole)) || normalise(targetRole).includes(normalise(item))));
  criteria.push({ label: "Target alignment", points: roleMentioned ? 20 : 0, maximum: 20, explanation: roleMentioned ? "Your saved direction is aligned to this target." : "Your saved career headline does not yet mention this target role." });
  const matchPoints = requirements.length ? Math.round((matchedSkills.length / requirements.length) * 35) : skills.length >= 3 ? 20 : skills.length ? 10 : 0;
  criteria.push({ label: "Requirement match", points: matchPoints, maximum: 35, explanation: requirements.length ? `${matchedSkills.length} of ${requirements.length} supplied requirements match your recorded skills.` : "Add role requirements for a tailored skills comparison." });
  const score = criteria.reduce((total, criterion) => total + criterion.points, 0);
  const recommendations = [
    !profile.headline?.trim() && "Add a specific career headline that states the type of work you want to pursue.",
    !profile.location?.trim() && "Add your location or select a remote preference.",
    skills.length < 3 && "Record at least three skills you can demonstrate through study, work or projects.",
    missingSkills.length > 0 && `Review these supplied requirements and add only skills you genuinely have evidence for: ${missingSkills.slice(0, 4).join(", ")}.`,
    requirements.length === 0 && "Paste job-relevant skills or requirements to compare your profile against a specific target.",
  ].filter((item): item is string => Boolean(item));
  return { score, confidence: profile.headline?.trim() && skills.length >= 3 && requirements.length >= 3 ? "medium" : "low", targetRole, matchedSkills, missingSkills, criteria, recommendations: recommendations.length ? recommendations : ["Keep evidence current and tailor your application note to the opportunity."], disclaimer: "This is an explainable profile-readiness indicator, not an automated hiring, admission, eligibility or ATS prediction. It uses only the profile fields and requirements shown here; it does not use protected traits, private documents, historic hiring data or opaque models." };
}

async function geminiAtsRecommendations(
  targetRole: string,
  profileSkills: string[],
  matchedSkills: string[],
  missingSkills: string[],
  score: number,
): Promise<string[] | null> {
  const { GEMINI_API_KEY, GEMINI_MODEL } = readEnvironment();
  const apiKey = GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = [
    `Analyze ATS readiness for target role "${targetRole}" (score ${score}/100).`,
    `Candidate skills: ${profileSkills.join(", ") || "none"}.`,
    `Matched requirements: ${matchedSkills.join(", ") || "none"}.`,
    `Missing requirements: ${missingSkills.join(", ") || "none"}.`,
    `Return strict JSON: {"recommendations": ["3 concise, actionable next steps grounded only in these skills"]}.`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const reply = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 350, responseMimeType: "application/json" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!reply.ok) return null;
    const data = await reply.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { recommendations?: unknown };
    if (!Array.isArray(parsed.recommendations)) return null;
    const clean = parsed.recommendations.filter((r): r is string => typeof r === "string" && r.trim().length > 0).slice(0, 4);
    return clean.length ? clean : null;
  } catch {
    return null;
  }
}

export async function atsReadiness(actor: TokenClaims, input: { targetRole?: string; requirements?: string[] }) {
  if (!candidateRoles.includes(actor.role)) throw new HttpError(403, "candidate_role_required", "ATS readiness is available to candidate accounts only.");
  const trimmedRole = input.targetRole?.trim();
  const reqs = unique(input.requirements ?? []);
  if (!trimmedRole || reqs.length === 0) {
    throw new HttpError(422, "missing_ats_input", "Provide both a target role and at least one requirement to check readiness.");
  }
  const [rows] = await database().execute<ProfileRow[]>("SELECT headline, location, skills, preferences FROM profiles WHERE user_id = ? LIMIT 1", [actor.sub]);
  const profile = rows[0];
  const profileSkills = stringList(profile?.skills ?? null);
  const result = calculateAtsReadiness({ headline: profile?.headline, location: profile?.location, skills: profileSkills, targetRoles: targets(profile?.preferences ?? null) }, { targetRole: trimmedRole, requirements: reqs });
  const aiRecs = await geminiAtsRecommendations(trimmedRole, profileSkills, result.matchedSkills, result.missingSkills, result.score);
  if (aiRecs) result.recommendations = aiRecs;
  await database().execute("INSERT INTO audit_events (id, actor_id, action, entity_type, metadata) VALUES (?, ?, 'ats_readiness.requested', 'profile', CAST(? AS JSON))", [randomUUID(), actor.sub, JSON.stringify({ targetRole: result.targetRole, requirementsCount: reqs.length, provider: aiRecs ? "gemini" : "rubric" })]);
  return result;
}
