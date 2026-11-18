import { describe, expect, it } from "vitest";
import {
  buildInsightCsv,
  deriveCandidateNextAction,
} from "../src/RoleInsights";

describe("candidate next-best-action rules", () => {
  it("prioritises missing profile evidence before application volume", () => {
    expect(deriveCandidateNextAction(50, 5, 3, 0, 0).title).toContain(
      "profile",
    );
  });

  it("moves a ready candidate from saving to deliberate application", () => {
    expect(deriveCandidateNextAction(100, 2, 0, 0, 0).title).toContain(
      "application",
    );
  });

  it("supports offer evaluation after a connected funnel outcome", () => {
    expect(deriveCandidateNextAction(100, 3, 2, 1, 1).title).toContain("offer");
  });
});

describe("role intelligence exports", () => {
  it("creates a self-describing CSV and protects spreadsheet formulas", () => {
    const csv = buildInsightCsv("company_admin", {
      title: "Hiring outcomes",
      summary: "Summary",
      metrics: [
        {
          label: "=Unsafe label",
          value: 4,
          detail: "Visible records",
          tone: "lime",
        },
      ],
      funnel: [{ label: "Applications", value: 4 }],
      action: {
        title: "Review candidates",
        reason: "Four require review",
        steps: ["Record evidence"],
      },
      quality: ["Human decisions only"],
    });
    expect(csv).toContain("FairMatch role intelligence report");
    expect(csv).toContain("'=Unsafe label");
    expect(csv).toContain("Human decisions only");
  });
});
