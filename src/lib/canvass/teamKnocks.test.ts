import { describe, expect, it } from "vitest";
import type { Period } from "../teamhistory/periods";
import { inScope, knockUserIds, latestScopedKnockDay, parseScope, placementOn, scopeLabel, scopeOptions, scopeParam, type ScopeDoor } from "./teamKnocks";

const period = (team: string, branch: string, from: string, to: string | null): Period => ({ team, branch, from, to, source: "sync" });

// Rep 101 was on Luke's team in Fort Worth, then moved to Cooper's team in Dallas on 1 June.
const rep101 = [period("Luke Huber", "Fort Worth", "2026-01-01", "2026-05-31"), period("Cooper Bledsoe", "Dallas", "2026-06-01", null)];
// Rep 202 has always been on Luke's team; rep 303 has no team history at all.
const rep202 = [period("Luke Huber", "Fort Worth", "2026-01-01", null)];
const history = new Map<string, Period[]>([["101", rep101], ["202", rep202]]);

// Noon Central, so the Texas day is the date written.
const at = (day: string) => `${day}T17:00:00Z`;

describe("scope in the request", () => {
  it("round-trips a team and a branch", () => {
    expect(parseScope(scopeParam({ kind: "team", name: "Luke Huber" }))).toEqual({ kind: "team", name: "Luke Huber" });
    expect(parseScope("branch:Fort Worth")).toEqual({ kind: "branch", name: "Fort Worth" });
  });

  it("refuses anything else", () => {
    expect(parseScope("rep:Luke Huber")).toBeNull();
    expect(parseScope("team:")).toBeNull();
    expect(parseScope("Luke Huber")).toBeNull();
    expect(parseScope(`team:${"x".repeat(101)}`)).toBeNull();
  });

  it("names the scope in plain words", () => {
    expect(scopeLabel({ kind: "team", name: "Luke Huber" })).toBe("Luke Huber's team");
    expect(scopeLabel({ kind: "branch", name: "Dallas" })).toBe("Dallas branch");
  });
});

describe("placementOn (the boards' rule)", () => {
  it("uses the period covering the day", () => {
    expect(placementOn(rep101, "2026-03-10")).toEqual({ team: "Luke Huber", branch: "Fort Worth" });
    expect(placementOn(rep101, "2026-06-01")).toEqual({ team: "Cooper Bledsoe", branch: "Dallas" });
  });

  it("puts a day before the history in the first period, and a rep with none nowhere", () => {
    expect(placementOn(rep101, "2025-08-01")).toEqual({ team: "Luke Huber", branch: "Fort Worth" });
    expect(placementOn([], "2026-03-10")).toBeNull();
    expect(inScope(null, { kind: "team", name: "Luke Huber" })).toBe(false);
  });

  it("puts a day in a gap with the nearest earlier period", () => {
    const gappy = [period("A", "X", "2026-01-01", "2026-02-28"), period("B", "Y", "2026-04-01", null)];
    expect(placementOn(gappy, "2026-03-15")).toEqual({ team: "A", branch: "X" });
  });
});

describe("latestScopedKnockDay", () => {
  const doors: ScopeDoor[] = [
    // House h1: rep 101 knocked in March (on Luke's team) and in July (on Cooper's team).
    { homeId: "h1", knocks: [{ at: at("2026-03-10"), userId: 101 }, { at: at("2026-07-02"), userId: 101 }], statusChanges: [] },
    // House h2: only rep 303, who has no team history.
    { homeId: "h2", knocks: [{ at: at("2026-07-05"), userId: 303 }], statusChanges: [] },
    // House h3: rep 202 changed the status; plus a knock with no rep.
    { homeId: "h3", knocks: [{ at: at("2026-08-01"), userId: null }], statusChanges: [{ at: at("2026-05-20"), userId: 202 }] },
  ];

  it("counts a knock for the team the rep was on that day, not their team today", () => {
    const luke = latestScopedKnockDay(doors, history, { kind: "team", name: "Luke Huber" });
    expect(luke.get("h1")).toBe("2026-03-10");
    expect(luke.get("h3")).toBe("2026-05-20");
    expect(luke.has("h2")).toBe(false);
    const cooper = latestScopedKnockDay(doors, history, { kind: "team", name: "Cooper Bledsoe" });
    expect([...cooper.entries()]).toEqual([["h1", "2026-07-02"]]);
  });

  it("works for a branch the same way", () => {
    const dallas = latestScopedKnockDay(doors, history, { kind: "branch", name: "Dallas" });
    expect([...dallas.entries()]).toEqual([["h1", "2026-07-02"]]);
    const fortWorth = latestScopedKnockDay(doors, history, { kind: "branch", name: "Fort Worth" });
    expect(fortWorth.get("h1")).toBe("2026-03-10");
  });

  it("lists who knocked, for loading only the histories needed", () => {
    expect(knockUserIds(doors).sort()).toEqual(["101", "202", "303"]);
  });
});

describe("scopeOptions", () => {
  it("offers every branch and every named team once, a team under its latest branch, sorted", () => {
    const options = scopeOptions([rep101, rep202, [period("", "Commercial", "2026-01-01", null)]]);
    expect(options.branches).toEqual(["Commercial", "Dallas", "Fort Worth"]);
    expect(options.teams).toEqual([
      { name: "Cooper Bledsoe", branch: "Dallas" },
      { name: "Luke Huber", branch: "Fort Worth" },
    ]);
  });
});
