import type { RowDataPacket } from "mysql2";
import { database } from "./database";
import type { TokenClaims } from "./identity";

type CountRow = RowDataPacket & { total: number };
type StatusRow = RowDataPacket & { status: string; total: number };
type ProfileRow = RowDataPacket & { headline: string | null; location: string | null; skills: unknown };

function parseSkills(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function getRoleInsights(actor: TokenClaims) {
  if (actor.role === "school_student" || actor.role === "college_student" || actor.role === "job_seeker") {
    const [profiles] = await database().execute<ProfileRow[]>(
      "SELECT headline, location, skills FROM profiles WHERE user_id = ? LIMIT 1",
      [actor.sub],
    );
    const [evidenceRows] = await database().execute<CountRow[]>(
      "SELECT COUNT(*) AS total FROM candidate_evidence WHERE user_id = ?",
      [actor.sub],
    );
    const [appRows] = await database().execute<StatusRow[]>(
      "SELECT status, COUNT(*) AS total FROM applications WHERE candidate_id = ? GROUP BY status",
      [actor.sub],
    );
    const [openOpps] = await database().query<CountRow[]>(
      "SELECT COUNT(*) AS total FROM opportunities WHERE status = 'published'",
    );
    const profile = profiles[0];
    const skills = parseSkills(profile?.skills);
    const readiness = Math.round(([true, profile?.headline, profile?.location, skills.length > 0].filter(Boolean).length / 4) * 100);
    const counts = Object.fromEntries(appRows.map((r) => [r.status, Number(r.total)]));
    const totalApps = Object.values(counts).reduce((acc, n) => acc + n, 0);
    const shortlisted = (counts.shortlisted ?? 0) + (counts.interview ?? 0) + (counts.offer ?? 0);
    const interviews = (counts.interview ?? 0) + (counts.offer ?? 0);
    const offers = counts.offer ?? 0;

    return {
      readiness,
      evidenceCount: Number(evidenceRows[0]?.total ?? 0),
      openOpportunities: Number(openOpps[0]?.total ?? 0),
      applications: totalApps,
      shortlisted,
      interviews,
      offers,
      metrics: [
        { label: "Profile readiness", value: readiness, unit: "%", detail: "Based on headline, location and recorded skills.", tone: "lime" as const },
        { label: "Evidence items", value: Number(evidenceRows[0]?.total ?? 0), unit: "items", detail: "Private documents, certificates and portfolio links.", tone: "sage" as const },
        { label: "Applications", value: totalApps, unit: "total", detail: "Submitted across published opportunities.", tone: "clay" as const },
        { label: "Offers", value: offers, unit: "offers", detail: "Applications reaching formal offer stage.", tone: "plum" as const },
      ],
      funnel: [
        { label: "Open roles", value: Number(openOpps[0]?.total ?? 0) },
        { label: "Submitted", value: totalApps },
        { label: "Shortlisted", value: shortlisted },
        { label: "Interviews", value: interviews },
        { label: "Offers", value: offers },
      ],
    };
  }

  if (actor.role === "company_hr" || actor.role === "company_admin") {
    const [members] = await database().execute<RowDataPacket[]>(
      "SELECT organisation_id FROM organisation_memberships WHERE user_id = ? AND status = 'active' LIMIT 1",
      [actor.sub],
    );
    const orgId = members[0]?.organisation_id as string | undefined;
    if (!orgId) {
      return { readiness: 0, applications: 0, interviews: 0, offers: 0, metrics: [], funnel: [] };
    }
    const [oppRows] = await database().execute<StatusRow[]>(
      "SELECT status, COUNT(*) AS total FROM opportunities WHERE organisation_id = ? GROUP BY status",
      [orgId],
    );
    const [appRows] = await database().execute<StatusRow[]>(
      `SELECT a.status, COUNT(*) AS total FROM applications a
       JOIN opportunities o ON o.id = a.opportunity_id
       WHERE o.organisation_id = ? GROUP BY a.status`,
      [orgId],
    );
    const oppCounts = Object.fromEntries(oppRows.map((r) => [r.status, Number(r.total)]));
    const appCounts = Object.fromEntries(appRows.map((r) => [r.status, Number(r.total)]));
    const published = oppCounts.published ?? 0;
    const totalApps = Object.values(appCounts).reduce((acc, n) => acc + n, 0);
    const shortlisted = (appCounts.shortlisted ?? 0) + (appCounts.interview ?? 0) + (appCounts.offer ?? 0);
    const interviews = (appCounts.interview ?? 0) + (appCounts.offer ?? 0);
    const offers = appCounts.offer ?? 0;
    return {
      readiness: published > 0 ? 100 : 50,
      applications: totalApps,
      interviews,
      offers,
      metrics: [
        { label: "Published roles", value: published, unit: "live", detail: "Active opportunities visible to candidates.", tone: "lime" as const },
        { label: "Total applicants", value: totalApps, unit: "candidates", detail: "Applications received across your roles.", tone: "clay" as const },
        { label: "Interviews", value: interviews, unit: "candidates", detail: "Applicants advanced to interview or offer.", tone: "sage" as const },
        { label: "Offers extended", value: offers, unit: "offers", detail: "Formal offers recorded with audit notes.", tone: "plum" as const },
      ],
      funnel: [
        { label: "Submitted", value: totalApps },
        { label: "Shortlisted", value: shortlisted },
        { label: "Interviews", value: interviews },
        { label: "Offers", value: offers },
      ],
    };
  }

  if (actor.role === "college_coordinator" || actor.role === "college_admin") {
    const [members] = await database().execute<RowDataPacket[]>(
      "SELECT organisation_id FROM organisation_memberships WHERE user_id = ? AND status = 'active' LIMIT 1",
      [actor.sub],
    );
    const orgId = members[0]?.organisation_id as string | undefined;
    if (!orgId) {
      return { readiness: 0, applications: 0, interviews: 0, offers: 0, metrics: [], funnel: [] };
    }
    const [cohorts] = await database().execute<CountRow[]>(
      "SELECT COUNT(*) AS total FROM college_cohorts WHERE organisation_id = ? AND status = 'active'",
      [orgId],
    );
    const [drives] = await database().execute<StatusRow[]>(
      "SELECT status, COUNT(*) AS total FROM placement_drives WHERE organisation_id = ? GROUP BY status",
      [orgId],
    );
    const driveCounts = Object.fromEntries(drives.map((r) => [r.status, Number(r.total)]));
    const totalDrives = Object.values(driveCounts).reduce((acc, n) => acc + n, 0);
    return {
      readiness: 100,
      applications: totalDrives,
      interviews: driveCounts.open ?? 0,
      offers: driveCounts.completed ?? 0,
      metrics: [
        { label: "Active cohorts", value: Number(cohorts[0]?.total ?? 0), unit: "cohorts", detail: "Graduating cohorts managed by your college.", tone: "lime" as const },
        { label: "Placement drives", value: totalDrives, unit: "drives", detail: "Planned, open and completed campus drives.", tone: "sage" as const },
        { label: "Open drives", value: driveCounts.open ?? 0, unit: "open", detail: "Drives currently accepting student participation.", tone: "clay" as const },
        { label: "Completed drives", value: driveCounts.completed ?? 0, unit: "completed", detail: "Drives with recorded completion.", tone: "plum" as const },
      ],
      funnel: [
        { label: "Planned", value: driveCounts.planned ?? 0 },
        { label: "Open", value: driveCounts.open ?? 0 },
        { label: "Completed", value: driveCounts.completed ?? 0 },
      ],
    };
  }

  // platform_admin
  const [users] = await database().query<CountRow[]>("SELECT COUNT(*) AS total FROM users");
  const [pending] = await database().query<CountRow[]>("SELECT COUNT(*) AS total FROM users WHERE account_status = 'pending_approval'");
  const [orgs] = await database().query<CountRow[]>("SELECT COUNT(*) AS total FROM organisations WHERE verification_status = 'verified'");
  const [audit] = await database().query<CountRow[]>("SELECT COUNT(*) AS total FROM audit_events");
  return {
    readiness: 100,
    applications: Number(users[0]?.total ?? 0),
    interviews: Number(orgs[0]?.total ?? 0),
    offers: Number(audit[0]?.total ?? 0),
    metrics: [
      { label: "Total accounts", value: Number(users[0]?.total ?? 0), unit: "users", detail: "Registered accounts across all FairMatch roles.", tone: "lime" as const },
      { label: "Pending approvals", value: Number(pending[0]?.total ?? 0), unit: "requests", detail: "Organisation requests awaiting admin verification.", tone: "clay" as const },
      { label: "Verified organisations", value: Number(orgs[0]?.total ?? 0), unit: "orgs", detail: "Approved colleges and companies.", tone: "sage" as const },
      { label: "Audit events", value: Number(audit[0]?.total ?? 0), unit: "events", detail: "Immutable governance and workflow records.", tone: "plum" as const },
    ],
    funnel: [
      { label: "Users", value: Number(users[0]?.total ?? 0) },
      { label: "Verified orgs", value: Number(orgs[0]?.total ?? 0) },
      { label: "Audit events", value: Number(audit[0]?.total ?? 0) },
    ],
  };
}
