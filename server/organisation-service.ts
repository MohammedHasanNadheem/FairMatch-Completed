import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./database";
import { HttpError } from "./http";
import type { FairMatchRole, TokenClaims } from "./identity";
import { createNotification } from "./notification-service";

type MembershipRow = RowDataPacket & { organisation_id: string; legal_name: string; kind: "college" | "company"; verification_status: string; membership_role: FairMatchRole; membership_status: "pending" | "active" | "revoked" };
type OpportunityRow = RowDataPacket & { id: string; title: string; type: "internship" | "placement" | "job"; location: string | null; work_mode: "onsite" | "hybrid" | "remote"; status: "draft" | "published" | "closed"; created_at: Date; applications: number };
type ApplicantRow = RowDataPacket & { id: string; candidate_id: string; status: string; submitted_at: Date; full_name: string; email: string; title: string; cover_note: string | null };
type CohortRow = RowDataPacket & { id: string; name: string; department: string | null; graduation_year: number; eligibility_notes: string | null; status: "active" | "archived"; created_at: Date };
type DriveRow = RowDataPacket & { id: string; cohort_id: string | null; cohort_name: string | null; title: string; employer_name: string; drive_date: Date | null; status: "planned" | "open" | "completed" | "cancelled"; notes: string | null; created_at: Date };

const organisationRoles = new Set<FairMatchRole>(["college_coordinator", "college_admin", "company_hr", "company_admin"]);
const companyRoles = new Set<FairMatchRole>(["company_hr", "company_admin"]);
const collegeRoles = new Set<FairMatchRole>(["college_coordinator", "college_admin"]);

const allowedApplicationTransitions: Record<string, Set<string>> = {
  submitted: new Set(["shortlisted", "rejected"]),
  shortlisted: new Set(["interview", "rejected"]),
  interview: new Set(["offer", "rejected"]),
  offer: new Set(["rejected"]),
};

async function membershipFor(actor: TokenClaims) {
  if (!organisationRoles.has(actor.role)) throw new HttpError(403, "organisation_role_required", "This workspace requires an approved college or company role.");
  const [rows] = await database().execute<MembershipRow[]>(
    `SELECT m.organisation_id, o.legal_name, o.kind, o.verification_status, m.membership_role, m.status AS membership_status
     FROM organisation_memberships m JOIN organisations o ON o.id = m.organisation_id
     WHERE m.user_id = ? AND m.membership_role = ? LIMIT 1`, [actor.sub, actor.role],
  );
  return rows[0] ?? null;
}

export async function organisationWorkspace(actor: TokenClaims) {
  const membership = await membershipFor(actor);
  if (!membership) return { approval: "pending" as const, organisation: null, opportunities: [], applications: [], cohorts: [], drives: [] };
  const organisation = { id: membership.organisation_id, name: membership.legal_name, kind: membership.kind, verificationStatus: membership.verification_status, membershipStatus: membership.membership_status };
  if (membership.membership_status !== "active" || membership.verification_status !== "verified") return { approval: "pending" as const, organisation, opportunities: [], applications: [], cohorts: [], drives: [] };

  if (collegeRoles.has(actor.role)) {
    const [cohorts] = await database().execute<CohortRow[]>(
      `SELECT id, name, department, graduation_year, eligibility_notes, status, created_at
       FROM college_cohorts WHERE organisation_id = ? ORDER BY graduation_year DESC, created_at DESC LIMIT 50`,
      [membership.organisation_id],
    );
    const [drives] = await database().execute<DriveRow[]>(
      `SELECT d.id, d.cohort_id, c.name AS cohort_name, d.title, d.employer_name, d.drive_date, d.status, d.notes, d.created_at
       FROM placement_drives d LEFT JOIN college_cohorts c ON c.id = d.cohort_id
       WHERE d.organisation_id = ? ORDER BY d.created_at DESC LIMIT 50`,
      [membership.organisation_id],
    );
    return {
      approval: "active" as const,
      organisation,
      opportunities: [],
      applications: [],
      cohorts: cohorts.map((c) => ({ id: c.id, name: c.name, department: c.department, graduationYear: Number(c.graduation_year), eligibilityNotes: c.eligibility_notes, status: c.status, createdAt: c.created_at.toISOString() })),
      drives: drives.map((d) => ({ id: d.id, cohortId: d.cohort_id, cohortName: d.cohort_name, title: d.title, employerName: d.employer_name, driveDate: d.drive_date ? d.drive_date.toISOString().slice(0, 10) : null, status: d.status, notes: d.notes, createdAt: d.created_at.toISOString() })),
    };
  }

  const [opportunities] = await database().execute<OpportunityRow[]>(
    `SELECT o.id, o.title, o.type, o.location, o.work_mode, o.status, o.created_at, COUNT(a.id) AS applications
     FROM opportunities o LEFT JOIN applications a ON a.opportunity_id = o.id
     WHERE o.organisation_id = ? GROUP BY o.id ORDER BY o.created_at DESC LIMIT 30`, [membership.organisation_id],
  );
  const [applications] = await database().execute<ApplicantRow[]>(
    `SELECT a.id, a.candidate_id, a.status, a.submitted_at, u.full_name, u.email, o.title, a.cover_note
     FROM applications a JOIN opportunities o ON o.id = a.opportunity_id JOIN users u ON u.id = a.candidate_id
     WHERE o.organisation_id = ? ORDER BY a.updated_at DESC LIMIT 30`, [membership.organisation_id],
  );
  return {
    approval: "active" as const,
    organisation,
    opportunities: opportunities.map((item) => ({ id: item.id, title: item.title, type: item.type, location: item.location, workMode: item.work_mode, status: item.status, createdAt: item.created_at.toISOString(), applications: Number(item.applications) })),
    applications: applications.map((item) => ({ id: item.id, status: item.status, submittedAt: item.submitted_at.toISOString(), candidate: { name: item.full_name, email: item.email }, opportunityTitle: item.title, coverNote: item.cover_note })),
    cohorts: [],
    drives: [],
  };
}

async function activeCompanyMembership(actor: TokenClaims) {
  if (!companyRoles.has(actor.role)) throw new HttpError(403, "company_role_required", "Only approved company team members can manage opportunities.");
  const membership = await membershipFor(actor);
  if (!membership || membership.membership_status !== "active" || membership.verification_status !== "verified") throw new HttpError(403, "organisation_pending", "Company verification and membership approval are required before making changes.");
  return membership;
}

async function activeCollegeMembership(actor: TokenClaims) {
  if (!collegeRoles.has(actor.role)) throw new HttpError(403, "college_role_required", "Only approved college team members can manage placement operations.");
  const membership = await membershipFor(actor);
  if (!membership || membership.membership_status !== "active" || membership.verification_status !== "verified") throw new HttpError(403, "organisation_pending", "College verification and membership approval are required before making changes.");
  return membership;
}

export async function createOrganisationOpportunity(actor: TokenClaims, input: { title: string; type: "internship" | "placement" | "job"; location?: string; workMode: "onsite" | "hybrid" | "remote"; description: string; requirements?: string[] }) {
  const membership = await activeCompanyMembership(actor);
  const id = randomUUID();
  await database().execute(
    "INSERT INTO opportunities (id, organisation_id, title, type, location, work_mode, description, requirements, status) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), 'draft')",
    [id, membership.organisation_id, input.title.trim(), input.type, input.location?.trim() || null, input.workMode, input.description.trim(), JSON.stringify((input.requirements ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 30))],
  );
  await database().execute("INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id) VALUES (?, ?, ?, 'opportunity.created', 'opportunity', ?)", [randomUUID(), actor.sub, membership.organisation_id, id]);
  return { id, status: "draft" };
}

export async function publishOrganisationOpportunity(actor: TokenClaims, opportunityId: string) {
  const membership = await activeCompanyMembership(actor);
  const [result] = await database().execute<ResultSetHeader>("UPDATE opportunities SET status = 'published', published_at = COALESCE(published_at, UTC_TIMESTAMP()) WHERE id = ? AND organisation_id = ? AND status IN ('draft', 'closed')", [opportunityId, membership.organisation_id]);
  if (!result.affectedRows) throw new HttpError(404, "opportunity_not_found", "A publishable opportunity was not found.");
  await database().execute("INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id) VALUES (?, ?, ?, 'opportunity.published', 'opportunity', ?)", [randomUUID(), actor.sub, membership.organisation_id, opportunityId]);
  return { id: opportunityId, status: "published" };
}

export async function closeOrganisationOpportunity(actor: TokenClaims, opportunityId: string) {
  const membership = await activeCompanyMembership(actor);
  const [result] = await database().execute<ResultSetHeader>("UPDATE opportunities SET status = 'closed' WHERE id = ? AND organisation_id = ? AND status = 'published'", [opportunityId, membership.organisation_id]);
  if (!result.affectedRows) throw new HttpError(404, "opportunity_not_found", "A published opportunity to close was not found.");
  await database().execute("INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id) VALUES (?, ?, ?, 'opportunity.closed', 'opportunity', ?)", [randomUUID(), actor.sub, membership.organisation_id, opportunityId]);
  return { id: opportunityId, status: "closed" };
}

export async function reviewOrganisationApplication(actor: TokenClaims, applicationId: string, status: "shortlisted" | "interview" | "offer" | "rejected", note?: string) {
  const membership = await activeCompanyMembership(actor);
  const [rows] = await database().execute<ApplicantRow[]>(
    `SELECT a.id, a.candidate_id, a.status, o.title
     FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
     WHERE a.id = ? AND o.organisation_id = ? LIMIT 1`,
    [applicationId, membership.organisation_id],
  );
  const current = rows[0];
  if (!current) throw new HttpError(404, "application_not_found", "Application was not found.");
  const allowed = allowedApplicationTransitions[current.status];
  if (!allowed || !allowed.has(status)) {
    throw new HttpError(409, "review_unavailable", `Cannot transition application from ${current.status} to ${status}.`);
  }
  await database().execute<ResultSetHeader>(
    "UPDATE applications SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?",
    [status, applicationId],
  );
  await database().execute(
    "INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, 'application', ?, CAST(? AS JSON))",
    [randomUUID(), actor.sub, membership.organisation_id, `application.${status}`, applicationId, JSON.stringify({ note: note?.trim().slice(0, 2000) || null })],
  );
  await createNotification({
    userId: current.candidate_id,
    title: `Application update: ${status}`,
    body: `${membership.legal_name} updated your application for ${current.title} to ${status}.`,
    category: "application",
    entityType: "application",
    entityId: applicationId,
  });
  return { id: applicationId, status };
}

export async function createCollegeCohort(
  actor: TokenClaims,
  input: { name: string; department?: string; graduationYear: number; eligibilityNotes?: string },
) {
  const membership = await activeCollegeMembership(actor);
  const id = randomUUID();
  await database().execute(
    "INSERT INTO college_cohorts (id, organisation_id, name, department, graduation_year, eligibility_notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, membership.organisation_id, input.name.trim(), input.department?.trim() || null, input.graduationYear, input.eligibilityNotes?.trim() || null, actor.sub],
  );
  await database().execute(
    "INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id) VALUES (?, ?, ?, 'cohort.created', 'cohort', ?)",
    [randomUUID(), actor.sub, membership.organisation_id, id],
  );
  return { id, status: "active" };
}

export async function createPlacementDrive(
  actor: TokenClaims,
  input: { cohortId?: string; title: string; employerName: string; driveDate?: string; notes?: string },
) {
  const membership = await activeCollegeMembership(actor);
  const id = randomUUID();
  await database().execute(
    "INSERT INTO placement_drives (id, organisation_id, cohort_id, title, employer_name, drive_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, membership.organisation_id, input.cohortId || null, input.title.trim(), input.employerName.trim(), input.driveDate || null, input.notes?.trim() || null, actor.sub],
  );
  await database().execute(
    "INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id) VALUES (?, ?, ?, 'placement_drive.created', 'placement_drive', ?)",
    [randomUUID(), actor.sub, membership.organisation_id, id],
  );
  return { id, status: "planned" };
}

export async function updatePlacementDriveStatus(
  actor: TokenClaims,
  driveId: string,
  status: "planned" | "open" | "completed" | "cancelled",
) {
  const membership = await activeCollegeMembership(actor);
  const [result] = await database().execute<ResultSetHeader>(
    "UPDATE placement_drives SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND organisation_id = ?",
    [status, driveId, membership.organisation_id],
  );
  if (!result.affectedRows) throw new HttpError(404, "drive_not_found", "Placement drive was not found.");
  await database().execute(
    "INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, 'placement_drive.updated', 'placement_drive', ?, CAST(? AS JSON))",
    [randomUUID(), actor.sub, membership.organisation_id, driveId, JSON.stringify({ status })],
  );
  return { id: driveId, status };
}
