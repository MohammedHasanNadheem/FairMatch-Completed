import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AdminRolePreview } from "../src/AdminRolePreview";
import { adminPreviewRoles, workspaceItemsFor } from "../src/WorkspaceShell";

afterEach(cleanup);

describe("platform owner role previews", () => {
  it("renders a distinct interior for every candidate navigation item", () => {
    const cases = [
      ["overview", "NEXT BEST ACTIONS"],
      ["discover", "Search opportunities"],
      ["applications", "APPLICATION TRACKER"],
      ["insights", "READINESS BREAKDOWN"],
      ["assistant", "ACCESS & USAGE"],
      ["profile", "Mohammed Hasan Nadheem"],
      ["account", "PRIVACY RIGHTS"],
    ] as const;

    for (const [view, expected] of cases) {
      const result = render(
        createElement(AdminRolePreview, { role: "college_student", view }),
      );
      expect(view === "discover" ? screen.getByLabelText(expected) : screen.getByText(expected)).toBeTruthy();
      result.unmount();
    }
  });

  it("adapts applications to age-safe school exploration", () => {
    render(
      createElement(AdminRolePreview, {
        role: "school_student",
        view: "applications",
      }),
    );
    expect(screen.getByText("EXPLORATION BOARD")).toBeTruthy();
    expect(screen.queryByText("APPLICATION TRACKER")).toBeNull();
  });

  it("keeps company opportunity management and college cohorts distinct", () => {
    const company = render(
      createElement(AdminRolePreview, {
        role: "company_hr",
        view: "discover",
      }),
    );
    expect(screen.getByText("OPPORTUNITY MANAGEMENT")).toBeTruthy();
    company.unmount();

    render(
      createElement(AdminRolePreview, {
        role: "college_coordinator",
        view: "discover",
      }),
    );
    expect(screen.getByText("COHORT MANAGEMENT")).toBeTruthy();
  });

  it("labels owner records as interactive but production-safe", () => {
    render(
      createElement(AdminRolePreview, {
        role: "company_admin",
        view: "insights",
      }),
    );
    expect(screen.getByText("Interactive owner preview")).toBeTruthy();
    expect(screen.getByText("Safe owner preview")).toBeTruthy();
  });

  it("routes a preview action to the connected workspace instead of opening a generic form", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(createElement(AdminRolePreview, { role: "college_student", view: "discover", onNavigate }));
    await user.click(screen.getAllByRole("button", { name: "Review & apply" })[0]);
    expect(onNavigate).toHaveBeenCalledWith("applications");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("filters candidate discovery results from the working search control", async () => {
    const user = userEvent.setup();
    render(createElement(AdminRolePreview, { role: "college_student", view: "discover" }));
    await user.type(screen.getByLabelText("Search opportunities"), "software");
    expect(screen.getByText("Graduate Software Engineer")).toBeTruthy();
    expect(screen.queryByText("Data Analyst Intern")).toBeNull();
  });

  it("renders a different full interior for every navigation item in every preview role", () => {
    for (const role of adminPreviewRoles) {
      const screenTexts = workspaceItemsFor(role).map(({ id }) => {
        const result = render(createElement(AdminRolePreview, { role, view: id }));
        const text = result.container.textContent?.replace(/\s+/g, " ").trim() ?? "";
        result.unmount();
        return text;
      });
      expect(screenTexts.every((text) => text.length > 150), `${role} has an empty interior`).toBe(true);
      expect(new Set(screenTexts).size, `${role} reuses the same interior`).toBe(screenTexts.length);
    }
  });
});
