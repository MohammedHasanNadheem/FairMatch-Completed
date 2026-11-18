import type { RowDataPacket } from "mysql2";
import { database } from "./database";
import { HttpError } from "./http";
import type { FairMatchRole, TokenClaims } from "./identity";

type ProfileRow = RowDataPacket & {
  full_name: string;
  headline: string | null;
  location: string | null;
  stage: "school" | "college" | "experienced" | null;
  skills: unknown;
  preferences: unknown;
  visibility: "private" | "application_only" | "discoverable";
  updated_at: Date | null;
};

export type CandidateProfileInput = {
  headline?: string;
  location?: string;
  skills?: string[];
  preferences?: { targetRoles?: string[]; preferredLocations?: string[]; workModes?: string[]; opportunityTypes?: string[] };
  visibility?: "private" | "application_only" | "discoverable";
};

function assertCandidate(role: FairMatchRole) {
  if (!["school_student", "college_student", "job_seeker"].includes(role)) {
    throw new HttpError(403, "candidate_role_required", "This profile workspace is available to candidates only.");
  }
}

function stageFor(role: FairMatchRole): "school" | "college" | "experienced" {
  if (role === "school_student") return "school";
  if (role === "college_student") return "college";
  return "experienced";
}

function parseJson(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function stringList(value: unknown): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function serialise(row: ProfileRow, role: FairMatchRole) {
  return {
    fullName: row.full_name,
    headline: row.headline ?? "",
    location: row.location ?? "",
    stage: row.stage ?? stageFor(role),
    skills: stringList(row.skills),
    preferences: parseJson(row.preferences),
    visibility: row.visibility,
    updatedAt: row.updated_at?.toISOString() ?? null,
  };
}

export async function getCandidateProfile(actor: TokenClaims) {
  assertCandidate(actor.role);
  const [rows] = await database().execute<ProfileRow[]>(
    `SELECT u.full_name, p.headline, p.location, p.stage, p.skills, p.preferences, p.visibility, p.updated_at
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ? LIMIT 1`,
    [actor.sub],
  );
  if (!rows[0]) throw new HttpError(404, "account_not_found", "Your account could not be found.");
  return serialise(rows[0], actor.role);
}

export async function updateCandidateProfile(actor: TokenClaims, input: CandidateProfileInput) {
  assertCandidate(actor.role);
  const visibility = actor.role === "school_student" ? "private" : input.visibility ?? "private";
  const skills = (input.skills ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 40);
  const preferences = input.preferences ?? {};
  await database().execute(
    `INSERT INTO profiles (user_id, headline, location, stage, skills, preferences, visibility)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE headline = VALUES(headline), location = VALUES(location), stage = VALUES(stage),
       skills = VALUES(skills), preferences = VALUES(preferences), visibility = VALUES(visibility), updated_at = UTC_TIMESTAMP()`,
    [actor.sub, input.headline?.trim().slice(0, 180) || null, input.location?.trim().slice(0, 120) || null,
      stageFor(actor.role), JSON.stringify(skills), JSON.stringify(preferences), visibility],
  );
  return getCandidateProfile(actor);
}
