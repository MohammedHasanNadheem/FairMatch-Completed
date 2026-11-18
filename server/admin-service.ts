import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./database";
import { HttpError } from "./http";
import type { TokenClaims } from "./identity";
import { createNotification } from "./notification-service";

type PendingRow = RowDataPacket & { user_id: string; full_name: string; email: string; role: string; requested_organisation_name: string; organisation_id: string; organisation_name: string; kind: "college" | "company"; created_at: Date };
type AuditRow = RowDataPacket & { id: string; actor_email: string | null; actor_name: string | null; organisation_name: string | null; action: string; entity_type: string; entity_id: string | null; metadata: unknown; created_at: Date };

function admin(actor: TokenClaims) { if (actor.role !== "platform_admin") throw new HttpError(403, "platform_admin_required", "Only a platform administrator can manage approvals."); }

export async function pendingAccessRequests(actor: TokenClaims) {
  admin(actor);
  const [rows] = await database().query<PendingRow[]>(
    `SELECT u.id AS user_id, u.full_name, u.email, u.role, u.requested_organisation_name, o.id AS organisation_id, o.legal_name AS organisation_name, o.kind, u.created_at
     FROM users u JOIN organisation_memberships m ON m.user_id = u.id JOIN organisations o ON o.id = m.organisation_id
     WHERE u.account_status = 'pending_approval' OR m.status = 'pending' OR o.verification_status = 'pending'
     ORDER BY u.created_at ASC LIMIT 100`,
  );
  return rows.map((row) => ({ userId: row.user_id, name: row.full_name, email: row.email, role: row.role, requestedOrganisationName: row.requested_organisation_name, organisationId: row.organisation_id, organisationName: row.organisation_name, kind: row.kind, requestedAt: row.created_at.toISOString() }));
}

export async function resolveAccessRequest(actor: TokenClaims, input: { userId: string; decision: "approve" | "reject"; note?: string }) {
  admin(actor);
  const connection = await database().getConnection();
  let organisationName = "";
  try {
    await connection.beginTransaction();
    const [members] = await connection.execute<PendingRow[]>(
      `SELECT u.id AS user_id, u.full_name, u.email, u.role, u.requested_organisation_name, o.id AS organisation_id, o.legal_name AS organisation_name, o.kind, u.created_at
       FROM users u JOIN organisation_memberships m ON m.user_id = u.id JOIN organisations o ON o.id = m.organisation_id
       WHERE u.id = ? FOR UPDATE`, [input.userId],
    );
    const request = members[0];
    if (!request) throw new HttpError(404, "access_request_not_found", "The requested access record was not found.");
    organisationName = request.organisation_name;
    const approved = input.decision === "approve";
    await connection.execute<ResultSetHeader>("UPDATE users SET account_status = ? WHERE id = ?", [approved ? "active" : "suspended", input.userId]);
    await connection.execute<ResultSetHeader>("UPDATE organisation_memberships SET status = ? WHERE user_id = ?", [approved ? "active" : "revoked", input.userId]);
    await connection.execute<ResultSetHeader>("UPDATE organisations SET verification_status = ? WHERE id = ?", [approved ? "verified" : "rejected", request.organisation_id]);
    await connection.execute("INSERT INTO audit_events (id, actor_id, organisation_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, 'access_request', ?, CAST(? AS JSON))", [randomUUID(), actor.sub, request.organisation_id, approved ? "access.approved" : "access.rejected", input.userId, JSON.stringify({ note: input.note?.trim().slice(0, 2000) || null })]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }

  await createNotification({
    userId: input.userId,
    title: input.decision === "approve" ? "Organisation access approved" : "Organisation access declined",
    body: input.decision === "approve"
      ? `Your workspace for ${organisationName} is now active.`
      : `Your access request for ${organisationName} was declined by platform administration.`,
    category: "approval",
    entityType: "access_request",
    entityId: input.userId,
  });

  return { userId: input.userId, decision: input.decision };
}

export async function listAuditEvents(actor: TokenClaims) {
  admin(actor);
  const [rows] = await database().query<AuditRow[]>(
    `SELECT a.id, u.email AS actor_email, u.full_name AS actor_name, o.legal_name AS organisation_name, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at
     FROM audit_events a
     LEFT JOIN users u ON u.id = a.actor_id
     LEFT JOIN organisations o ON o.id = a.organisation_id
     ORDER BY a.created_at DESC
     LIMIT 100`,
  );
  return rows.map((row) => ({
    id: row.id,
    actorEmail: row.actor_email,
    actorName: row.actor_name,
    organisationName: row.organisation_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: typeof row.metadata === "string" ? (() => { try { return JSON.parse(row.metadata); } catch { return null; } })() : row.metadata,
    createdAt: row.created_at.toISOString(),
  }));
}
