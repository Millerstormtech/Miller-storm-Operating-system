import { describe, it, expect } from "vitest";
import { opensAllTraining } from "./access";

describe("opensAllTraining", () => {
  it("opens every lesson for leadership", () => {
    for (const role of ["admin", "c-level", "branch-manager", "sales-team-lead"]) {
      expect(opensAllTraining(role)).toBe(true);
    }
  });

  it("opens every lesson for marketing (decided 2026-10-15)", () => {
    expect(opensAllTraining("marketing")).toBe(true);
  });

  it("keeps sales reps on the in-order lock", () => {
    expect(opensAllTraining("sales")).toBe(false);
  });

  it("locks anything unknown or missing", () => {
    expect(opensAllTraining(undefined)).toBe(false);
    expect(opensAllTraining(null)).toBe(false);
    expect(opensAllTraining("")).toBe(false);
    expect(opensAllTraining("Marketing")).toBe(false);
  });
});
