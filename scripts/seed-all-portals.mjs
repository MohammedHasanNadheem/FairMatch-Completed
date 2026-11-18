import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const privateRailway = databaseUrl.includes(".railway.internal");
const connection = await mysql.createConnection({
  uri: databaseUrl,
  ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1") || privateRailway
    ? undefined
    : { rejectUnauthorized: true },
});

const defaultPassword = process.env.PORTAL_DEFAULT_PASSWORD ?? "FairMatchPortal2026!";
const passwordHash = await bcrypt.hash(defaultPassword, 12);

const portals = [
  { email: "school.student@fairmatch.app", fullName: "Aarav Sharma", role: "school_student", stage: "school", headline: "Exploring science and product design pathways", skills: ["Python", "Design Thinking", "Communication"] },
  { email: "college.student@fairmatch.app", fullName: "Priya Nair", role: "college_student", stage: "college", headline: "Final-year Computer Science student seeking software internships", skills: ["React", "TypeScript", "SQL", "Git"] },
  { email: "job.seeker@fairmatch.app", fullName: "Karthik Menon", role: "job_seeker", stage: "experienced", headline: "Full-stack developer with 2 years of production experience", skills: ["Node.js", "React", "MySQL", "TypeScript", "Docker"] },
  { email: "coordinator@fairmatch.app", fullName: "Meera Krishnan", role: "college_coordinator", orgKind: "college", orgName: "FairMatch Institute of Technology" },
  { email: "college.admin@fairmatch.app", fullName: "Dr. Suresh Iyer", role: "college_admin", orgKind: "college", orgName: "FairMatch Institute of Technology" },
  { email: "hr@fairmatch.app", fullName: "Ananya Rao", role: "company_hr", orgKind: "company", orgName: "FairMatch Labs" },
  { email: "company.admin@fairmatch.app", fullName: "Vikram Patel", role: "company_admin", orgKind: "company", orgName: "FairMatch Labs" },
  { email: "admin@fairmatch.app", fullName: "FairMatch Platform Admin", role: "platform_admin" },
];

async function ensureOrg(kind, legalName) {
  const [rows] = await connection.execute("SELECT id FROM organisations WHERE kind = ? AND legal_name = ? LIMIT 1", [kind, legalName]);
  if (rows[0]) {
    await connection.execute("UPDATE organisations SET verification_status = 'verified' WHERE id = ?", [rows[0].id]);
    return rows[0].id;
  }
  const id = randomUUID();
  await connection.execute("INSERT INTO organisations (id, kind, legal_name, verification_status) VALUES (?, ?, ?, 'verified')", [id, kind, legalName]);
  return id;
}

try {
  const companyOrgId = await ensureOrg("company", "FairMatch Labs");
  const collegeOrgId = await ensureOrg("college", "FairMatch Institute of Technology");
  let collegeCoordinatorId = null;

  for (const portal of portals) {
    const [existing] = await connection.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [portal.email]);
    let userId;
    if (existing[0]) {
      userId = existing[0].id;
      await connection.execute(
        "UPDATE users SET role = ?, account_status = 'active', email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?",
        [portal.role, userId],
      );
    } else {
      userId = randomUUID();
      await connection.execute(
        "INSERT INTO users (id, email, password_hash, full_name, role, account_status, requested_organisation_name, email_verified_at) VALUES (?, ?, ?, ?, ?, 'active', ?, UTC_TIMESTAMP())",
        [userId, portal.email, passwordHash, portal.fullName, portal.role, portal.orgName ?? null],
      );
    }

    if (portal.orgKind === "company") {
      await connection.execute(
        "INSERT INTO organisation_memberships (organisation_id, user_id, membership_role, status) VALUES (?, ?, ?, 'active') ON DUPLICATE KEY UPDATE membership_role = VALUES(membership_role), status = 'active'",
        [companyOrgId, userId, portal.role],
      );
    } else if (portal.orgKind === "college") {
      if (!collegeCoordinatorId) collegeCoordinatorId = userId;
      await connection.execute(
        "INSERT INTO organisation_memberships (organisation_id, user_id, membership_role, status) VALUES (?, ?, ?, 'active') ON DUPLICATE KEY UPDATE membership_role = VALUES(membership_role), status = 'active'",
        [collegeOrgId, userId, portal.role],
      );
    }

    if (portal.stage) {
      const [profiles] = await connection.execute("SELECT user_id FROM profiles WHERE user_id = ? LIMIT 1", [userId]);
      if (!profiles[0]) {
        await connection.execute(
          "INSERT INTO profiles (user_id, headline, location, stage, skills, preferences, visibility) VALUES (?, ?, 'Chennai, Remote', ?, CAST(? AS JSON), CAST(? AS JSON), 'private')",
          [userId, portal.headline, portal.stage, JSON.stringify(portal.skills), JSON.stringify({ targetRoles: [], preferredLocations: ["Chennai", "Remote"] })],
        );
      }
    }
  }

  const [opps] = await connection.query("SELECT id FROM opportunities LIMIT 1");
  if (!opps[0]) {
    await connection.execute(
      `INSERT INTO opportunities (id, organisation_id, title, type, location, work_mode, description, requirements, status, published_at)
       VALUES (?, ?, 'Software Engineering Intern', 'internship', 'Chennai', 'hybrid', 'Build accessible React and TypeScript features alongside senior engineers with structured mentorship.', CAST(? AS JSON), 'published', UTC_TIMESTAMP()),
              (?, ?, 'Junior Full-Stack Developer', 'job', 'Remote', 'remote', 'Work across React, Node.js, and MySQL APIs with clear code review and transparent hiring criteria.', CAST(? AS JSON), 'published', UTC_TIMESTAMP())`,
      [
        randomUUID(), companyOrgId, JSON.stringify(["React", "TypeScript", "Git", "SQL"]),
        randomUUID(), companyOrgId, JSON.stringify(["React", "Node.js", "MySQL", "TypeScript"]),
      ],
    );
  }

  if (collegeCoordinatorId) {
    const [cohorts] = await connection.execute("SELECT id FROM college_cohorts WHERE organisation_id = ? LIMIT 1", [collegeOrgId]);
    if (!cohorts[0]) {
      const cohortId = randomUUID();
      await connection.execute(
        "INSERT INTO college_cohorts (id, organisation_id, name, department, graduation_year, eligibility_notes, status, created_by) VALUES (?, ?, 'B.E. Computer Science 2027', 'Computer Science', 2027, 'Minimum 7.0 CGPA with active portfolio evidence.', 'active', ?)",
        [cohortId, collegeOrgId, collegeCoordinatorId],
      );
      await connection.execute(
        "INSERT INTO placement_drives (id, organisation_id, cohort_id, title, employer_name, drive_date, status, notes, created_by) VALUES (?, ?, ?, 'Campus Engineering Placement Drive', 'FairMatch Labs', '2026-12-10', 'open', 'Technical screening and structured portfolio review.', ?)",
        [randomUUID(), collegeOrgId, cohortId, collegeCoordinatorId],
      );
    }
  }

  console.log("Seeded all 8 FairMatch portal accounts and starter records.");
} finally {
  await connection.end();
}
