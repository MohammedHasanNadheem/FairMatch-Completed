import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./database";
import { hashPassword, hashToken, signToken, type FairMatchRole, verifyPassword, verifyToken } from "./identity";
import { HttpError } from "./http";

type UserRow = RowDataPacket & { id: string; email: string; password_hash: string; role: FairMatchRole; account_status: "active" | "pending_approval" | "suspended"; email_verified_at: Date | null };

export type AuthResult = { accessToken: string; refreshToken: string; user: { id: string; email: string; role: FairMatchRole; accountStatus: string; emailVerified: boolean } };

function normaliseEmail(email: string) { return email.trim().toLowerCase(); }

async function issueTokens(user: UserRow): Promise<AuthResult> {
  if (user.account_status === "suspended") throw new HttpError(403, "account_suspended", "This FairMatch account is suspended.");
  const sessionId = randomUUID();
  const claims = { sub: user.id, email: user.email, role: user.role, sessionId } as const;
  const [accessToken, refreshToken] = await Promise.all([signToken({ ...claims, type: "access" }, "10m"), signToken({ ...claims, type: "refresh" }, "30d")]);
  await database().execute(
    "INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))",
    [sessionId, user.id, hashToken(refreshToken)],
  );
  return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role, accountStatus: user.account_status, emailVerified: Boolean(user.email_verified_at) } };
}

export async function register(input: { fullName: string; email: string; password: string; requestedRole: FairMatchRole; organisationName?: string }) {
  if (!input.password || input.password.length < 12) throw new HttpError(422, "weak_password", "Use a password with at least 12 characters.");
  const role = input.requestedRole;
  if (role === "platform_admin") throw new HttpError(403, "forbidden_role", "Platform administrator access cannot be requested through public registration.");
  const status = ["college_coordinator", "college_admin", "company_hr", "company_admin"].includes(role) ? "pending_approval" : "active";
  const id = randomUUID();
  const isOrganisationRole = ["college_coordinator", "college_admin", "company_hr", "company_admin"].includes(role);
  const verificationRequired = process.env.MAIL_PROVIDER_ENABLED === "true";
  try {
    if (isOrganisationRole) {
      const organisationName = input.organisationName?.trim();
      if (!organisationName) throw new HttpError(422, "organisation_required", "Enter the college or company name for this access request.");
      const connection = await database().getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute<ResultSetHeader>(
          "INSERT INTO users (id, email, password_hash, full_name, role, account_status, requested_organisation_name, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, IF(?, NULL, UTC_TIMESTAMP()))",
          [id, normaliseEmail(input.email), await hashPassword(input.password), input.fullName.trim(), role, status, organisationName, verificationRequired],
        );
        const organisationId = randomUUID();
        const kind = role.startsWith("college_") ? "college" : "company";
        await connection.execute("INSERT INTO organisations (id, kind, legal_name) VALUES (?, ?, ?)", [organisationId, kind, organisationName]);
        await connection.execute("INSERT INTO organisation_memberships (organisation_id, user_id, membership_role, status) VALUES (?, ?, ?, 'pending')", [organisationId, id, role]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
      return { id, email: normaliseEmail(input.email), role, accountStatus: status, verificationRequired };
    }
    await database().execute<ResultSetHeader>(
      "INSERT INTO users (id, email, password_hash, full_name, role, account_status, requested_organisation_name, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, IF(?, NULL, UTC_TIMESTAMP()))",
      [id, normaliseEmail(input.email), await hashPassword(input.password), input.fullName.trim(), role, status, input.organisationName?.trim() || null, verificationRequired],
    );
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY") throw new HttpError(409, "email_in_use", "An account already exists for this email. Sign in or reset your password.");
    throw error;
  }
  return { id, email: normaliseEmail(input.email), role, accountStatus: status, verificationRequired };
}

export async function login(email: string, password: string) {
  const [rows] = await database().execute<UserRow[]>("SELECT id, email, password_hash, role, account_status, email_verified_at FROM users WHERE email = ? LIMIT 1", [normaliseEmail(email)]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) throw new HttpError(401, "invalid_credentials", "Email or password is incorrect.");
  if (!user.email_verified_at) throw new HttpError(403, "email_unverified", "Verify your email before signing in.");
  return issueTokens(user);
}

const portalAccounts: Record<FairMatchRole, { email: string; fullName: string; orgKind?: "college" | "company"; orgName?: string; stage?: "school" | "college" | "experienced"; headline?: string; skills?: string[] }> = {
  school_student: { email: "school.student@fairmatch.app", fullName: "Aarav Sharma", stage: "school", headline: "Exploring science and product design pathways", skills: ["Python", "Design Thinking", "Communication"] },
  college_student: { email: "college.student@fairmatch.app", fullName: "Priya Nair", stage: "college", headline: "Final-year Computer Science student seeking software internships", skills: ["React", "TypeScript", "SQL", "Git"] },
  job_seeker: { email: "job.seeker@fairmatch.app", fullName: "Karthik Menon", stage: "experienced", headline: "Full-stack developer with 2 years of production experience", skills: ["Node.js", "React", "MySQL", "TypeScript", "Docker"] },
  college_coordinator: { email: "coordinator@fairmatch.app", fullName: "Meera Krishnan", orgKind: "college", orgName: "FairMatch Institute of Technology" },
  college_admin: { email: "college.admin@fairmatch.app", fullName: "Dr. Suresh Iyer", orgKind: "college", orgName: "FairMatch Institute of Technology" },
  company_hr: { email: "hr@fairmatch.app", fullName: "Ananya Rao", orgKind: "company", orgName: "FairMatch Labs" },
  company_admin: { email: "company.admin@fairmatch.app", fullName: "Vikram Patel", orgKind: "company", orgName: "FairMatch Labs" },
  platform_admin: { email: "admin@fairmatch.app", fullName: "FairMatch Platform Admin" },
};

async function ensurePortalOrganisation(kind: "college" | "company", legalName: string) {
  const [orgs] = await database().execute<RowDataPacket[]>(
    "SELECT id FROM organisations WHERE kind = ? AND legal_name = ? LIMIT 1",
    [kind, legalName],
  );
  if (orgs[0]) {
    await database().execute("UPDATE organisations SET verification_status = 'verified' WHERE id = ?", [orgs[0].id]);
    return orgs[0].id as string;
  }
  const orgId = randomUUID();
  await database().execute(
    "INSERT INTO organisations (id, kind, legal_name, verification_status) VALUES (?, ?, ?, 'verified')",
    [orgId, kind, legalName],
  );
  return orgId;
}

async function ensureStarterWorkflowData(userId: string, role: FairMatchRole, orgId?: string) {
  const spec = portalAccounts[role];
  if (spec.stage) {
    const [profiles] = await database().execute<RowDataPacket[]>("SELECT user_id FROM profiles WHERE user_id = ? LIMIT 1", [userId]);
    if (!profiles[0]) {
      await database().execute(
        "INSERT INTO profiles (user_id, headline, location, stage, skills, preferences, visibility) VALUES (?, ?, 'Chennai, Remote', ?, CAST(? AS JSON), CAST(? AS JSON), 'private')",
        [userId, spec.headline ?? "", spec.stage, JSON.stringify(spec.skills ?? []), JSON.stringify({ targetRoles: [], preferredLocations: ["Chennai", "Remote"] })],
      );
    }
  }

  // Ensure published opportunities exist so candidate discovery & company pipeline have real MySQL records
  const [opps] = await database().query<RowDataPacket[]>("SELECT id FROM opportunities LIMIT 1");
  if (!opps[0]) {
    const companyOrgId = orgId && spec.orgKind === "company" ? orgId : await ensurePortalOrganisation("company", "FairMatch Labs");
    await database().execute(
      `INSERT INTO opportunities (id, organisation_id, title, type, location, work_mode, description, requirements, status, published_at)
       VALUES (?, ?, 'Software Engineering Intern', 'internship', 'Chennai', 'hybrid', 'Build accessible React and TypeScript features alongside senior engineers with structured mentorship.', CAST(? AS JSON), 'published', UTC_TIMESTAMP()),
              (?, ?, 'Junior Full-Stack Developer', 'job', 'Remote', 'remote', 'Work across React, Node.js, and MySQL APIs with clear code review and transparent hiring criteria.', CAST(? AS JSON), 'published', UTC_TIMESTAMP())`,
      [
        randomUUID(), companyOrgId, JSON.stringify(["React", "TypeScript", "Git", "SQL"]),
        randomUUID(), companyOrgId, JSON.stringify(["React", "Node.js", "MySQL", "TypeScript"]),
      ],
    );
  }

  if (spec.orgKind === "college" && orgId) {
    const [cohorts] = await database().execute<RowDataPacket[]>("SELECT id FROM college_cohorts WHERE organisation_id = ? LIMIT 1", [orgId]);
    if (!cohorts[0]) {
      const cohortId = randomUUID();
      await database().execute(
        "INSERT INTO college_cohorts (id, organisation_id, name, department, graduation_year, eligibility_notes, status, created_by) VALUES (?, ?, 'B.E. Computer Science 2027', 'Computer Science', 2027, 'Minimum 7.0 CGPA with active portfolio evidence.', 'active', ?)",
        [cohortId, orgId, userId],
      ).catch(() => undefined);
      await database().execute(
        "INSERT INTO placement_drives (id, organisation_id, cohort_id, title, employer_name, drive_date, status, notes, created_by) VALUES (?, ?, ?, 'Campus Engineering Placement Drive', 'FairMatch Labs', '2026-12-10', 'open', 'Technical screening and structured portfolio review.', ?)",
        [randomUUID(), orgId, cohortId, userId],
      ).catch(() => undefined);
    }
  }
}

export async function loginPortal(role: FairMatchRole) {
  const spec = portalAccounts[role];
  if (!spec) throw new HttpError(400, "invalid_role", "Unknown FairMatch portal.");

  const [rows] = await database().execute<UserRow[]>(
    "SELECT id, email, password_hash, role, account_status, email_verified_at FROM users WHERE email = ? LIMIT 1",
    [spec.email],
  );
  let user = rows[0];
  let orgId: string | undefined;

  if (!user) {
    const id = randomUUID();
    const passwordHash = await hashPassword("FairMatchPortal2026!");
    await database().execute(
      "INSERT INTO users (id, email, password_hash, full_name, role, account_status, requested_organisation_name, email_verified_at) VALUES (?, ?, ?, ?, ?, 'active', ?, UTC_TIMESTAMP())",
      [id, spec.email, passwordHash, spec.fullName, role, spec.orgName ?? null],
    );
    const [created] = await database().execute<UserRow[]>(
      "SELECT id, email, password_hash, role, account_status, email_verified_at FROM users WHERE id = ? LIMIT 1",
      [id],
    );
    user = created[0];
  } else if (user.account_status !== "active" || !user.email_verified_at || user.role !== role) {
    await database().execute(
      "UPDATE users SET role = ?, account_status = 'active', email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?",
      [role, user.id],
    );
    user = { ...user, role, account_status: "active", email_verified_at: user.email_verified_at ?? new Date() };
  }

  if (spec.orgKind && spec.orgName) {
    orgId = await ensurePortalOrganisation(spec.orgKind, spec.orgName);
    await database().execute(
      `INSERT INTO organisation_memberships (organisation_id, user_id, membership_role, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE membership_role = VALUES(membership_role), status = 'active'`,
      [orgId, user.id, role],
    );
  }

  await ensureStarterWorkflowData(user.id, role, orgId);
  return issueTokens(user);
}

export async function refresh(refreshToken: string) {
  const claims = await verifyToken(refreshToken, "refresh");
  if (!claims) throw new HttpError(401, "invalid_refresh", "Your session has expired. Sign in again.");
  const [sessions] = await database().execute<RowDataPacket[]>("SELECT id FROM refresh_sessions WHERE id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1", [claims.sessionId, hashToken(refreshToken)]);
  if (!sessions[0]) throw new HttpError(401, "invalid_refresh", "Your session has expired. Sign in again.");
  await database().execute("UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?", [claims.sessionId]);
  const [users] = await database().execute<UserRow[]>("SELECT id, email, password_hash, role, account_status, email_verified_at FROM users WHERE id = ? LIMIT 1", [claims.sub]);
  if (!users[0]) throw new HttpError(401, "invalid_refresh", "Your session has expired. Sign in again.");
  return issueTokens(users[0]);
}

export async function signOut(refreshToken: string) {
  const claims = await verifyToken(refreshToken, "refresh");
  if (claims) await database().execute("UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?", [claims.sessionId]);
}

export async function requireUser(accessToken: string) {
  const claims = await verifyToken(accessToken, "access");
  if (!claims) throw new HttpError(401, "unauthorised", "Sign in again to continue.");
  return claims;
}
