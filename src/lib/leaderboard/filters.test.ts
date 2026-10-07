import { describe, it, expect } from "vitest";
import { NO_VALUE, matchesSelection, selectedNames, selectionChipLabel, shareForSelection } from "./filters";
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

describe("shareForSelection (team history)", () => {
  const seg = (team: string, branch: string, from: string, to: string, revenue: number) =>
    ({ team, branch, from, to, revenue, verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: revenue ? 1 : 0 });
  const jason = { id: "rc:1", team: "Daniel Reyes", branch: "Fort Worth", revenue: 150, verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: 2,
    segments: [seg("Gunner McCullough", "Fort Worth", "2026-09-01", "2026-09-15", 100), seg("Daniel Reyes", "Fort Worth", "2026-09-16", "2026-09-30", 50)] };
  it("no filter: untouched", () => expect(shareForSelection(jason, new Set(), new Set())).toMatchObject({ revenue: 150, movedOut: null, joined: null }));
  it("old team: pre-move share, moved out", () =>
    expect(shareForSelection(jason, new Set(), new Set(["Gunner McCullough"]))).toMatchObject({ revenue: 100, won: 1, movedOut: { team: "Daniel Reyes" } }));
  it("both teams ticked: once, whole, no tag", () =>
    expect(shareForSelection(jason, new Set(), new Set(["Gunner McCullough", "Daniel Reyes"]))).toMatchObject({ revenue: 150, movedOut: null, joined: null }));
  it("branch AND team must both match", () => expect(shareForSelection(jason, new Set(["Dallas"]), new Set(["Gunner McCullough"]))).toBeNull());
  it("(No team) matches blank-team stretches only", () => expect(shareForSelection(jason, new Set(), new Set([NO_VALUE]))).toBeNull());
});
