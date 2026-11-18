import { describe, expect, it } from "vitest";
import {
  adminPreviewRoles,
  canAdminPreviewRole,
  workspaceItemsFor,
} from "../src/WorkspaceShell";

describe("role-aware workspace navigation", () => {
  it("keeps platform controls out of candidate navigation", () => {
    const items = workspaceItemsFor("job_seeker").map((item) => item.id);
    expect(items).toEqual([
      "overview",
      "discover",
      "applications",
      "insights",
      "assistant",
      "profile",
      "account",
    ]);
    expect(items).not.toContain("operations");
    expect(items).not.toContain("audit");
  });

  it("gives platform administrators access to operational governance", () => {
    const items = workspaceItemsFor("platform_admin").map((item) => item.id);
    expect(items).toContain("operations");
    expect(items).toContain("audit");
  });

  it("keeps company and college workflows distinct", () => {
    expect(workspaceItemsFor("company_hr").map((item) => item.label)).toContain(
      "Candidate review",
    );
    expect(
      workspaceItemsFor("college_coordinator").map((item) => item.label),
    ).toContain("Cohorts");
  });

  it("makes the appropriate explainable assistant visible in every portal", () => {
    for (const role of [
      "school_student",
      "college_student",
      "job_seeker",
      "college_coordinator",
      "college_admin",
      "company_hr",
      "company_admin",
      "platform_admin",
    ] as const) {
      expect(workspaceItemsFor(role).map((item) => item.id)).toContain(
        "assistant",
      );
    }
  });

  it("gives every role a measurable outcome-intelligence view", () => {
    for (const role of [
      "school_student",
      "college_student",
      "job_seeker",
      "college_coordinator",
      "college_admin",
      "company_hr",
      "company_admin",
      "platform_admin",
    ] as const) {
      expect(workspaceItemsFor(role).map((item) => item.id)).toContain(
        "insights",
      );
    }
  });

  it("gives every role access to account security and privacy controls", () => {
    for (const role of [
      "school_student",
      "college_student",
      "job_seeker",
      "college_coordinator",
      "college_admin",
      "company_hr",
      "company_admin",
      "platform_admin",
    ] as const) {
      expect(workspaceItemsFor(role).map((item) => item.id)).toContain(
        "account",
      );
    }
  });

  it("lets only the platform administrator preview every non-admin portal", () => {
    expect(adminPreviewRoles).toHaveLength(7);
    expect(new Set(adminPreviewRoles).size).toBe(7);
    expect(adminPreviewRoles).not.toContain("platform_admin");
    for (const role of adminPreviewRoles)
      expect(canAdminPreviewRole("platform_admin", role)).toBe(true);
    expect(canAdminPreviewRole("company_admin", "college_student")).toBe(false);
    expect(canAdminPreviewRole("platform_admin", null)).toBe(false);
  });
});
