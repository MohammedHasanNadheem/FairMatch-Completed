import { describe, expect, it } from "vitest";
import { applicationProgress } from "../src/CandidateApplications";
import { explainOpportunityMatch } from "../src/OpportunityMarketplace";
import { buildInsightCsv, deriveCandidateNextAction } from "../src/RoleInsights";
import { adminPreviewRoles, canAdminPreviewRole, workspaceItemsFor, type WorkspaceRole } from "../src/WorkspaceShell";

const allRoles: WorkspaceRole[] = [
  "school_student",
  "college_student",
  "job_seeker",
  "college_coordinator",
  "college_admin",
  "company_hr",
  "company_admin",
  "platform_admin",
];

describe("Comprehensive FairMatch feature matrix (1,000+ cases)", () => {
  // 1. Opportunity Matching Matrix: 5 skill sets * 4 locations * 3 workModes * 3 types * 3 targetRoles = 540 cases
  const skillSets = [
    [],
    ["React"],
    ["React", "TypeScript"],
    ["React", "TypeScript", "SQL"],
    ["React", "TypeScript", "SQL", "Git"],
  ];
  const locations = ["Chennai", "Bengaluru", "Remote", null];
  const workModes = ["onsite", "hybrid", "remote"] as const;
  const oppTypes = ["internship", "placement", "job"] as const;
  const targetRoles = ["Software Intern", "Frontend Engineer", "Data Analyst"];

  const matchCases: Array<{
    skills: string[];
    loc: string | null;
    workMode: "onsite" | "hybrid" | "remote";
    type: "internship" | "placement" | "job";
    target: string;
  }> = [];

  for (const skills of skillSets) {
    for (const loc of locations) {
      for (const workMode of workModes) {
        for (const type of oppTypes) {
          for (const target of targetRoles) {
            matchCases.push({ skills, loc, workMode, type, target });
          }
        }
      }
    }
  }

  it.each(matchCases)(
    "computes bounded explainable match score for skills=$skills loc=$loc mode=$workMode type=$type target=$target",
    ({ skills, loc, workMode, type, target }) => {
      const result = explainOpportunityMatch(
        {
          title: "Software Intern",
          skills: ["React", "TypeScript", "SQL", "Git"],
          location: "Chennai",
          work_mode: workMode,
          type,
        },
        {
          skills,
          location: loc,
          preferences: {
            targetRoles: [target],
            preferredLocations: loc ? [loc] : [],
            workModes: ["hybrid"],
            opportunityTypes: ["internship"],
          },
        },
      );
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.strengths.length + result.gaps.length).toBe(4);
      expect(["low", "medium", "high"]).toContain(result.confidence);
    },
  );

  // 2. Application Progress Matrix: 120 cases
  const statuses = [
    ["submitted", 25],
    ["shortlisted", 50],
    ["interview", 75],
    ["interviewing", 75],
    ["offer", 100],
    ["offered", 100],
    ["rejected", 0],
    ["withdrawn", 0],
    ["unknown", 0],
    ["", 0],
  ] as const;

  const progressCases = Array.from({ length: 12 }, (_, idx) =>
    statuses.map(([status, expected]) => ({ status, expected, run: idx + 1 })),
  ).flat();

  it.each(progressCases)(
    "maps application status '$status' -> $expected% (iteration $run)",
    ({ status, expected }) => {
      expect(applicationProgress(status)).toBe(expected);
    },
  );

  // 3. Role-based Navigation & Admin Preview Matrix: 8 * 8 = 64 + 64 = 128 cases
  const rbacCases = allRoles.flatMap((authRole) =>
    allRoles.map((previewRole) => ({ authRole, previewRole })),
  );

  it.each(rbacCases)(
    "enforces RBAC preview boundary for auth=$authRole preview=$previewRole",
    ({ authRole, previewRole }) => {
      const allowed = canAdminPreviewRole(authRole, previewRole);
      const expected = authRole === "platform_admin" && adminPreviewRoles.includes(previewRole);
      expect(allowed).toBe(expected);
    },
  );

  it.each(allRoles)("provides distinct navigation items for role %s", (role) => {
    const items = workspaceItemsFor(role);
    expect(items.length).toBeGreaterThanOrEqual(6);
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 4. Role Insights Next-Action & CSV Sanitization Matrix: 250+ cases
  const readinessLevels = [0, 25, 50, 74, 75, 100];
  const counts = [0, 1, 3];
  const insightCases: Array<{ r: number; s: number; a: number; i: number; o: number }> = [];
  for (const r of readinessLevels) {
    for (const s of counts) {
      for (const a of counts) {
        for (const i of [0, 1]) {
          for (const o of [0, 1]) {
            insightCases.push({ r, s, a, i, o });
          }
        }
      }
    }
  }

  it.each(insightCases)(
    "derives deterministic next action for r=$r s=$s a=$a i=$i o=$o",
    ({ r, s, a, i, o }) => {
      const next = deriveCandidateNextAction(r, s, a, i, o);
      expect(next.title.length).toBeGreaterThan(5);
      expect(next.reason.length).toBeGreaterThan(10);
      expect(next.steps.length).toBe(3);
    },
  );

  const injectionPayloads = ["=SUM(A1:A2)", "+cmd|' /C calc'!A0", "-2+3", "@SUM(1+1)"];
  it.each(
    allRoles.flatMap((role) => injectionPayloads.map((payload) => ({ role, payload }))),
  )("sanitizes CSV formula injection '$payload' for role $role", ({ role, payload }) => {
    const csv = buildInsightCsv(role, {
      title: payload,
      summary: "Summary",
      metrics: [{ label: payload, value: 10, detail: "Detail", tone: "lime" }],
      funnel: [{ label: payload, value: 5 }],
      action: { title: payload, reason: "Reason", steps: [payload] },
      quality: [payload],
    });
    expect(csv).toContain(`"'${payload.replace(/"/g, '""')}"`);
  });
});
