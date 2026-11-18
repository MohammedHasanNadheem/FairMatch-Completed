import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./database";
import { HttpError } from "./http";
import type { FairMatchRole, TokenClaims } from "./identity";
import { createNotification } from "./notification-service";

type OpportunityType = "internship" | "placement" | "job";
type OpportunityRow = RowDataPacket & {
  id: string; title: string; type: OpportunityType; location: string | null; work_mode: "onsite" | "hybrid" | "remote";
  description: string; requirements: unknown; published_at: Date; organisation_name: string;
};
type ApplicationRow = RowDataPacket & {
  id: string; status: string; submitted_at: Date; updated_at: Date; cover_note: string | null;
  opportunity_id: string; title: string; type: OpportunityType; location: string | null; work_mode: string; organisation_name: string;
};
type OpportunityOrgRow = RowDataPacket & { id: string; organisation_id: string; title: string };
type MemberUserRow = RowDataPacket & { user_id: string };
type OwnedApplicationRow = RowDataPacket & { id: string; status: string; organisation_id: string; title: string };

export type OpportunityFilter = { query?: string; type?: OpportunityType; workMode?: "onsite" | "hybrid" | "remote"; page?: number; pageSize?: number };

function normaliseRequirements(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return []; }
  }
  return value ?? [];
}

function serialiseOpportunity(row: OpportunityRow) {
  return {
    id: row.id, title: row.title, type: row.type, location: row.location, workMode: row.work_mode,
    description: row.description, requirements: normaliseRequirements(row.requirements), organisationName: row.organisation_name,
    publishedAt: row.published_at.toISOString(),
  };
}

export async function listPublishedOpportunities(filter: OpportunityFilter) {
  const page = Math.max(1, Math.min(10_000, filter.page ?? 1));
  const pageSize = Math.max(1, Math.min(50, filter.pageSize ?? 12));
  const conditions = ["o.status = 'published'"];
  const values: unknown[] = [];
  if (filter.type) { conditions.push("o.type = ?"); values.push(filter.type); }
  if (filter.workMode) { conditions.push("o.work_mode = ?"); values.push(filter.workMode); }
  if (filter.query?.trim()) {
    conditions.push("(o.title LIKE ? OR o.description LIKE ? OR org.legal_name LIKE ?)");
    const term = `%${filter.query.trim().slice(0, 100)}%`;
    values.push(term, term, term);
  }
  const where = conditions.join(" AND ");
  const [countRows] = await database().query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM opportunities o JOIN organisations org ON org.id = o.organisation_id WHERE ${where}`, values);
  const [rows] = await database().query<OpportunityRow[]>(
    `SELECT o.id, o.title, o.type, o.location, o.work_mode, o.description, o.requirements, o.published_at, org.legal_name AS organisation_name
     FROM opportunities o JOIN organisations org ON org.id = o.organisation_id
     WHERE ${where} ORDER BY o.published_at DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(serialiseOpportunity), page, pageSize, total: Number(countRows[0]?.total ?? 0) };
}

function candidateCanApply(role: FairMatchRole) {
  return role === "college_student" || role === "job_seeker";
}

async function notifyOrganisationMembers(organisationId: string, title: string, body: string, entityId: string) {
  const [members] = await database().execute<MemberUserRow[]>(
    "SELECT user_id FROM organisation_memberships WHERE organisation_id = ? AND status = 'active'",
    [organisationId],
  );
  await Promise.all(members.map((member) =>
    createNotification({ userId: member.user_id, title, body, category: "application", entityType: "application", entityId }),
  ));
}

export async function createApplication(actor: TokenClaims, input: { opportunityId: string; coverNote?: string }) {
  if (!candidateCanApply(actor.role)) throw new HttpError(403, "candidate_role_required", "Only college students and job seekers can submit an application.");
  const [opportunities] = await database().execute<OpportunityOrgRow[]>("SELECT id, organisation_id, title FROM opportunities WHERE id = ? AND status = 'published' LIMIT 1", [input.opportunityId]);
  const opportunity = opportunities[0];
  if (!opportunity) throw new HttpError(404, "opportunity_not_found", "This opportunity is unavailable or no longer accepting applications.");
  const id = randomUUID();
  try {
    await database().execute("INSERT INTO applications (id, opportunity_id, candidate_id, cover_note) VALUES (?, ?, ?, ?)", [id, input.opportunityId, actor.sub, input.coverNote?.trim() || null]);
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY") throw new HttpError(409, "already_applied", "You have already applied for this opportunity.");
    throw error;
  }
  await database().execute("INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id) VALUES (?, ?, ?, 'application.submitted', 'application', ?)", [randomUUID(), actor.sub, opportunity.organisation_id, id]);
  await notifyOrganisationMembers(opportunity.organisation_id, "New candidate application", `A candidate applied for ${opportunity.title}.`, id);
  return { id, status: "submitted", submittedAt: new Date().toISOString() };
}

export async function listCandidateApplications(actor: TokenClaims) {
  if (!candidateCanApply(actor.role)) throw new HttpError(403, "candidate_role_required", "This application workspace is available to candidates only.");
  const [rows] = await database().execute<ApplicationRow[]>(
    `SELECT a.id, a.status, a.submitted_at, a.updated_at, a.cover_note, o.id AS opportunity_id, o.title, o.type, o.location, o.work_mode, org.legal_name AS organisation_name
     FROM applications a JOIN opportunities o ON o.id = a.opportunity_id JOIN organisations org ON org.id = o.organisation_id
     WHERE a.candidate_id = ? ORDER BY a.updated_at DESC`, [actor.sub],
  );
  return rows.map((row) => ({
    id: row.id, status: row.status, submittedAt: row.submitted_at.toISOString(), updatedAt: row.updated_at.toISOString(), coverNote: row.cover_note,
    opportunity: { id: row.opportunity_id, title: row.title, type: row.type, location: row.location, workMode: row.work_mode, organisationName: row.organisation_name },
  }));
}

export async function updateCandidateApplication(
  actor: TokenClaims,
  input: { applicationId: string; action: "withdraw" | "accept_offer" | "decline_offer"; note?: string },
) {
  if (!candidateCanApply(actor.role)) throw new HttpError(403, "candidate_role_required", "Only candidates can update their applications.");
  const [rows] = await database().execute<OwnedApplicationRow[]>(
    `SELECT a.id, a.status, o.organisation_id, o.title
     FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
     WHERE a.id = ? AND a.candidate_id = ? LIMIT 1`,
    [input.applicationId, actor.sub],
  );
  const existing = rows[0];
  if (!existing) throw new HttpError(404, "application_not_found", "Application was not found.");

  if (input.action === "withdraw") {
    if (!["submitted", "shortlisted", "interview", "offer"].includes(existing.status)) {
      throw new HttpError(409, "withdraw_unavailable", "Only active applications can be withdrawn.");
    }
    await database().execute<ResultSetHeader>(
      "UPDATE applications SET status = 'withdrawn', updated_at = UTC_TIMESTAMP() WHERE id = ? AND candidate_id = ?",
      [input.applicationId, actor.sub],
    );
    await database().execute(
      "INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, 'application.withdrawn', 'application', ?, CAST(? AS JSON))",
      [randomUUID(), actor.sub, existing.organisation_id, input.applicationId, JSON.stringify({ note: input.note?.trim() || null })],
    );
    await notifyOrganisationMembers(existing.organisation_id, "Application withdrawn", `A candidate withdrew their application for ${existing.title}.`, input.applicationId);
    return { id: input.applicationId, status: "withdrawn" };
  }

  if (existing.status !== "offer") {
    throw new HttpError(409, "offer_required", "Offer responses are only available when an offer has been extended.");
  }

  const nextStatus = input.action === "decline_offer" ? "withdrawn" : "offer";
  if (input.action === "decline_offer") {
    await database().execute<ResultSetHeader>(
      "UPDATE applications SET status = 'withdrawn', updated_at = UTC_TIMESTAMP() WHERE id = ? AND candidate_id = ?",
      [input.applicationId, actor.sub],
    );
  }
  const auditAction = input.action === "accept_offer" ? "offer.accepted" : "offer.declined";
  await database().execute(
    "INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, 'application', ?, CAST(? AS JSON))",
    [randomUUID(), actor.sub, existing.organisation_id, auditAction, input.applicationId, JSON.stringify({ note: input.note?.trim() || null })],
  );
  await notifyOrganisationMembers(
    existing.organisation_id,
    input.action === "accept_offer" ? "Offer accepted" : "Offer declined",
    `Candidate ${input.action === "accept_offer" ? "accepted" : "declined"} the offer for ${existing.title}.`,
    input.applicationId,
  );
  return { id: input.applicationId, status: nextStatus, offerDecision: input.action === "accept_offer" ? "accepted" : "declined" };
}
