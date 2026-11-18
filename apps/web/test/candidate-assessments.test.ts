import { describe, expect, it } from "vitest";
import { assessmentProgress } from "../src/CandidateAssessments";

describe("assessment progress", () => {
  it("reports zero for an assessment without loaded questions", () => {
    expect(assessmentProgress(0, {})).toBe(0);
  });

  it("reports answered questions without exceeding one hundred percent", () => {
    expect(assessmentProgress(4, { a: 1, b: 0 })).toBe(50);
    expect(assessmentProgress(1, { a: 1, b: 0 })).toBe(100);
  });
});
