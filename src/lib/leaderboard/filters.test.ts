import { describe, it, expect } from "vitest";
import { NO_VALUE, matchesSelection, selectedNames, selectionChipLabel } from "./filters";
import { BRANCH_ORDER } from "../repcard/branches";

const set = (...v: string[]) => new Set(v);

describe("matchesSelection", () => {
  it("lets everything through when nothing is selected", () => {
    expect(matchesSelection("Fort Worth", set())).toBe(true);
    expect(matchesSelection("", set())).toBe(true);
  });

  it("keeps only the selected values", () => {
    expect(matchesSelection("Fort Worth", set("Fort Worth"))).toBe(true);
    expect(matchesSelection("Dallas", set("Fort Worth"))).toBe(false);
  });

  it("accepts any one of several selected values", () => {
    const picked = set("Fort Worth", "Dallas");
    expect(matchesSelection("Fort Worth", picked)).toBe(true);
    expect(matchesSelection("Dallas", picked)).toBe(true);
    expect(matchesSelection("West Texas", picked)).toBe(false);
  });

  it("treats a blank value as the 'not set' bucket, never as a match for a real branch", () => {
    expect(matchesSelection("", set(NO_VALUE))).toBe(true);
    expect(matchesSelection(null, set(NO_VALUE))).toBe(true);
    expect(matchesSelection(undefined, set(NO_VALUE))).toBe(true);
    expect(matchesSelection("", set("Fort Worth"))).toBe(false);
    expect(matchesSelection("Fort Worth", set(NO_VALUE))).toBe(false);
  });

  it("can select a real branch and the 'not set' bucket together", () => {
    const picked = set("Dallas", NO_VALUE);
    expect(matchesSelection("Dallas", picked)).toBe(true);
    expect(matchesSelection("", picked)).toBe(true);
    expect(matchesSelection("Fort Worth", picked)).toBe(false);
  });
});

describe("selectedNames", () => {
  const order = BRANCH_ORDER;

  it("is empty when nothing is selected", () => {
    expect(selectedNames(set(), order, "(No branch)")).toEqual([]);
  });

  it("returns names in canonical order, not the order they were ticked", () => {
    expect(selectedNames(set("West Texas", "Fort Worth"), order, "(No branch)"))
      .toEqual(["Fort Worth", "West Texas"]);
  });

  it("puts the 'not set' bucket last, under its label", () => {
    expect(selectedNames(set(NO_VALUE, "Dallas"), order, "(No branch)"))
      .toEqual(["Dallas", "(No branch)"]);
  });

  it("keeps a value that has no canonical rank, after the ranked ones", () => {
    expect(selectedNames(set("Mystery", "Fort Worth"), order, "(No branch)"))
      .toEqual(["Fort Worth", "Mystery"]);
  });
});

describe("selectionChipLabel", () => {
  it("says 'all' when nothing is selected", () => {
    expect(selectionChipLabel([], "All branches", "branches")).toBe("All branches");
  });

  it("names the single selection rather than counting it", () => {
    expect(selectionChipLabel(["Fort Worth"], "All branches", "branches")).toBe("Fort Worth");
  });

  it("counts once there is more than one", () => {
    expect(selectionChipLabel(["Fort Worth", "Dallas"], "All branches", "branches")).toBe("2 branches");
    expect(selectionChipLabel(["a", "b", "c"], "All teams", "teams")).toBe("3 teams");
  });
});
