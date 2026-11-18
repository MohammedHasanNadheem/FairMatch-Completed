import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./database";
import { HttpError } from "./http";
import type { FairMatchRole, TokenClaims } from "./identity";

const candidateRoles: FairMatchRole[] = ["school_student", "college_student", "job_seeker"];
const kinds = ["resume", "portfolio", "certificate", "employment", "achievement", "offer_letter", "project", "other"] as const;
export type EvidenceKind = typeof kinds[number];
type EvidenceRow = RowDataPacket & { id: string; kind: EvidenceKind; title: string; issuer: string | null; issued_on: Date | null; expires_on: Date | null; verification_url: string | null; portfolio_url: string | null; skills: unknown; notes: string | null; file_name: string | null; mime_type: string | null; file_size_bytes: number | null; verification_status: "self_attested" | "pending" | "verified" | "rejected"; created_at: Date };

function candidate(actor: TokenClaims) {
  if (!candidateRoles.includes(actor.role)) throw new HttpError(403, "candidate_role_required", "Evidence records are available to candidate accounts only.");
}
function list(value: unknown) {
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}
function serialise(row: EvidenceRow) {
  return { id: row.id, kind: row.kind, title: row.title, issuer: row.issuer ?? "", issuedOn: row.issued_on?.toISOString().slice(0, 10) ?? null, expiresOn: row.expires_on?.toISOString().slice(0, 10) ?? null, verificationUrl: row.verification_url ?? "", portfolioUrl: row.portfolio_url ?? "", skills: list(row.skills), notes: row.notes ?? "", fileName: row.file_name ?? "", fileType: row.mime_type ?? "", fileSizeBytes: row.file_size_bytes ?? 0, verificationStatus: row.verification_status, createdAt: row.created_at.toISOString() };
}

export async function listEvidence(actor: TokenClaims) {
  candidate(actor);
  const [rows] = await database().execute<EvidenceRow[]>("SELECT id, kind, title, issuer, issued_on, expires_on, verification_url, portfolio_url, skills, notes, file_name, mime_type, file_size_bytes, verification_status, created_at FROM candidate_evidence WHERE user_id = ? ORDER BY created_at DESC", [actor.sub]);
  return rows.map(serialise);
}

export async function createEvidence(actor: TokenClaims, input: { kind: EvidenceKind; title: string; issuer?: string; issuedOn?: string; expiresOn?: string; verificationUrl?: string; portfolioUrl?: string; skills?: string[]; notes?: string; file?: { name: string; type: string; base64: string } }) {
  candidate(actor);
  const rawFile = input.file?.base64 ? Buffer.from(input.file.base64, "base64") : null;
  if (rawFile && (!rawFile.length || rawFile.length > 2 * 1024 * 1024)) throw new HttpError(422, "invalid_file", "Choose a PDF, PNG or JPEG file no larger than 2 MB.");
  if (input.file && !["application/pdf", "image/png", "image/jpeg"].includes(input.file.type)) throw new HttpError(422, "invalid_file", "Only PDF, PNG and JPEG evidence files are allowed.");
  const id = randomUUID();
  await database().execute<ResultSetHeader>(
    "INSERT INTO candidate_evidence (id, user_id, kind, title, issuer, issued_on, expires_on, verification_url, portfolio_url, skills, notes, file_name, mime_type, file_size_bytes, file_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?)",
    [id, actor.sub, input.kind, input.title.trim(), input.issuer?.trim() || null, input.issuedOn || null, input.expiresOn || null, input.verificationUrl?.trim() || null, input.portfolioUrl?.trim() || null, JSON.stringify((input.skills ?? []).map((skill) => skill.trim()).filter(Boolean).slice(0, 20)), input.notes?.trim() || null, input.file?.name || null, input.file?.type || null, rawFile?.length || null, rawFile],
  );
  await database().execute("INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, 'candidate_evidence.created', 'candidate_evidence', ?, CAST(? AS JSON))", [randomUUID(), actor.sub, id, JSON.stringify({ kind: input.kind, hasFile: Boolean(rawFile) })]);
  const [rows] = await database().execute<EvidenceRow[]>("SELECT id, kind, title, issuer, issued_on, expires_on, verification_url, portfolio_url, skills, notes, file_name, mime_type, file_size_bytes, verification_status, created_at FROM candidate_evidence WHERE id = ? AND user_id = ? LIMIT 1", [id, actor.sub]);
  return serialise(rows[0]);
}

export async function applyEvidenceSkills(actor: TokenClaims, evidenceId: string) {
  candidate(actor);
  const [evidence] = await database().execute<RowDataPacket[]>("SELECT skills FROM candidate_evidence WHERE id = ? AND user_id = ? LIMIT 1", [evidenceId, actor.sub]);
  if (!evidence[0]) throw new HttpError(404, "evidence_not_found", "Evidence record not found.");
  const [profiles] = await database().execute<RowDataPacket[]>("SELECT skills FROM profiles WHERE user_id = ? LIMIT 1", [actor.sub]);
  if (!profiles[0]) throw new HttpError(422, "profile_required", "Save your profile before applying evidence skills.");
  const merged = [...new Map([...list(profiles[0].skills), ...list(evidence[0].skills)].map((skill) => [skill.trim().toLowerCase(), skill.trim()])).values()].filter(Boolean).slice(0, 40);
  await database().execute("UPDATE profiles SET skills = CAST(? AS JSON), updated_at = UTC_TIMESTAMP() WHERE user_id = ?", [JSON.stringify(merged), actor.sub]);
  await database().execute("INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, 'candidate_evidence.skills_applied', 'candidate_evidence', ?)", [randomUUID(), actor.sub, evidenceId]);
  return merged;
}

export async function deleteEvidence(actor: TokenClaims, evidenceId: string) {
  candidate(actor);
  const [result] = await database().execute<ResultSetHeader>("DELETE FROM candidate_evidence WHERE id = ? AND user_id = ?", [evidenceId, actor.sub]);
  if (!result.affectedRows) throw new HttpError(404, "evidence_not_found", "Evidence record not found.");
  await database().execute("INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, 'candidate_evidence.deleted', 'candidate_evidence', ?)", [randomUUID(), actor.sub, evidenceId]);
}
