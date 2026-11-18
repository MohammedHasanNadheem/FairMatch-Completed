import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./database";
import { HttpError } from "./http";
import { hashPassword, type TokenClaims, verifyPassword } from "./identity";

type PrivacyRequestRow = RowDataPacket & {
  id: string;
  request_type: "export" | "deletion";
  status: "pending" | "in_review" | "completed" | "cancelled";
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

type UserPasswordRow = RowDataPacket & {
  id: string;
  email: string;
  full_name: string;
  role: string;
  account_status: string;
  password_hash: string;
  created_at: Date;
};

export async function listPrivacyRequests(actor: TokenClaims) {
  const [rows] = await database().execute<PrivacyRequestRow[]>(
    `SELECT id, request_type, status, notes, created_at, updated_at
     FROM privacy_requests
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [actor.sub],
  );
  return rows.map((row) => ({
    id: row.id,
    requestType: row.request_type,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function createPrivacyRequest(
  actor: TokenClaims,
  input: { requestType: "export" | "deletion"; notes?: string },
) {
  const [existing] = await database().execute<RowDataPacket[]>(
    "SELECT id FROM privacy_requests WHERE user_id = ? AND request_type = ? AND status IN ('pending', 'in_review') LIMIT 1",
    [actor.sub, input.requestType],
  );
  if (existing[0]) {
    throw new HttpError(409, "request_already_open", `You already have an open ${input.requestType} request.`);
  }
  const id = randomUUID();
  await database().execute(
    "INSERT INTO privacy_requests (id, user_id, request_type, status, notes) VALUES (?, ?, ?, 'pending', ?)",
    [id, actor.sub, input.requestType, input.notes?.trim() || null],
  );
  await database().execute(
    "INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, 'privacy_request', ?, CAST(? AS JSON))",
    [randomUUID(), actor.sub, `privacy.${input.requestType}_requested`, id, JSON.stringify({ notes: input.notes?.trim() || null })],
  );
  return { id, requestType: input.requestType, status: "pending", createdAt: new Date().toISOString() };
}

export async function exportAccountData(actor: TokenClaims) {
  const [users] = await database().execute<UserPasswordRow[]>(
    "SELECT id, email, full_name, role, account_status, created_at FROM users WHERE id = ? LIMIT 1",
    [actor.sub],
  );
  const [profiles] = await database().execute<RowDataPacket[]>(
    "SELECT headline, location, stage, skills, preferences, visibility, updated_at FROM profiles WHERE user_id = ? LIMIT 1",
    [actor.sub],
  );
  const [evidence] = await database().execute<RowDataPacket[]>(
    "SELECT id, kind, title, issuer, issued_on, expires_on, verification_url, portfolio_url, skills, verification_status, created_at FROM candidate_evidence WHERE user_id = ? ORDER BY created_at DESC",
    [actor.sub],
  );
  const [applications] = await database().execute<RowDataPacket[]>(
    `SELECT a.id, a.status, a.submitted_at, a.updated_at, a.cover_note, o.title AS opportunity_title, org.legal_name AS organisation_name
     FROM applications a
     JOIN opportunities o ON o.id = a.opportunity_id
     JOIN organisations org ON org.id = o.organisation_id
     WHERE a.candidate_id = ?
     ORDER BY a.submitted_at DESC`,
    [actor.sub],
  );
  await database().execute(
    "INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, 'privacy.data_exported', 'user', ?)",
    [randomUUID(), actor.sub, actor.sub],
  );
  return {
    exportedAt: new Date().toISOString(),
    account: users[0] ?? null,
    profile: profiles[0] ?? null,
    evidence,
    applications,
  };
}

export async function changePassword(actor: TokenClaims, currentPassword: string, newPassword: string) {
  if (!newPassword || newPassword.length < 12) {
    throw new HttpError(422, "weak_password", "Use a new password with at least 12 characters.");
  }
  const [users] = await database().execute<UserPasswordRow[]>(
    "SELECT id, password_hash FROM users WHERE id = ? LIMIT 1",
    [actor.sub],
  );
  const user = users[0];
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    throw new HttpError(401, "invalid_credentials", "Your current password is incorrect.");
  }
  const nextHash = await hashPassword(newPassword);
  await database().execute<ResultSetHeader>("UPDATE users SET password_hash = ? WHERE id = ?", [nextHash, actor.sub]);
  await database().execute("UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND id <> ?", [actor.sub, actor.sessionId]);
  await database().execute(
    "INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, 'account.password_changed', 'user', ?)",
    [randomUUID(), actor.sub, actor.sub],
  );
  return { updated: true };
}
