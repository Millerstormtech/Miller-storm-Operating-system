import { describe, it, expect } from "vitest";
import {
  aggregateOverall,
  filterRows,
  filtersActive,
  teamStandings,
  teamMembers,
  teamSummaryFor,
  weekStartMonday,
  computeRankDeltas,
  courseHeaderStats,
} from "./board";
import type { CourseStats } from "./scoring";

function stats(partial: Partial<CourseStats>): CourseStats {
  return {
    videosWatched: 0,
    videosTotal: 0,
    quizzesPassed: 0,
    quizzesTotal: 0,
    itemsCompleted: 0,
    itemsTotal: 0,
    pct: 0,
    complete: false,
    finalTestPerfect: false,
    started: false,
    ...partial,
  };
}

describe("aggregateOverall", () => {
  it("sums items across courses and counts completed courses", () => {
    const agg = aggregateOverall([
      stats({ itemsCompleted: 10, itemsTotal: 20, videosWatched: 6, quizzesPassed: 4, complete: false }),
      stats({ itemsCompleted: 30, itemsTotal: 30, videosWatched: 15, quizzesPassed: 15, complete: true }),
    ]);
    expect(agg.itemsCompleted).toBe(40);
    expect(agg.itemsTotal).toBe(50);
    expect(agg.videosWatched).toBe(21);
    expect(agg.quizzesPassed).toBe(19);
    expect(agg.coursesCompleted).toBe(1);
    expect(agg.pct).toBe(80);
    expect(agg.started).toBe(true);
  });

  it("reports hasTestAce when any course has a perfect final test", () => {
    expect(aggregateOverall([stats({}), stats({ finalTestPerfect: true })]).hasTestAce).toBe(true);
    expect(aggregateOverall([stats({}), stats({})]).hasTestAce).toBe(false);
  });

  it("is not started with zero items and yields pct 0 on an empty library", () => {
    const agg = aggregateOverall([]);
    expect(agg.started).toBe(false);
    expect(agg.pct).toBe(0);
    expect(agg.itemsTotal).toBe(0);
  });
});

describe("filterRows / filtersActive", () => {
  const rows = [
    { name: "Fernando Cano", branch: "West Texas", team: "Daniel Sabedra" },
    { name: "Sarah Beth", branch: "Dallas", team: "Mike Muscari" },
    { name: "Marcus Reed", branch: "Dallas", team: "Cooper" },
  ];

  it("no filters returns everything", () => {
    expect(filterRows(rows, { search: "", branch: "", team: "" })).toHaveLength(3);
    expect(filtersActive({ search: "", branch: "", team: "" })).toBe(false);
  });

  it("search matches case-insensitively on name", () => {
    expect(filterRows(rows, { search: "sarah", branch: "", team: "" })).toEqual([rows[1]]);
    expect(filtersActive({ search: "sarah", branch: "", team: "" })).toBe(true);
  });

  it("branch and team filters combine", () => {
    expect(filterRows(rows, { search: "", branch: "Dallas", team: "" })).toHaveLength(2);
    expect(filterRows(rows, { search: "", branch: "Dallas", team: "Cooper" })).toEqual([rows[2]]);
  });

  it("whitespace-only search is inactive", () => {
    expect(filtersActive({ search: "   ", branch: "", team: "" })).toBe(false);
  });
});

describe("teamStandings / teamSummaryFor", () => {
  const rows = [
    { team: "Cooper", pct: 40 },
    { team: "Cooper", pct: 60 },
    { team: "Luke", pct: 80 },
    { team: "Luke", pct: 0 },   // not-started members still count toward the average
    { team: "", pct: 90 },      // teamless reps never form a team
  ];

  it("ranks teams by average pct, including zero-progress members", () => {
    const st = teamStandings(rows);
    expect(st).toEqual([
      { team: "Cooper", size: 2, avgPct: 50, rank: 1 },
      { team: "Luke", size: 2, avgPct: 40, rank: 2 },
    ]);
  });

  it("summarizes one team with the total team count", () => {
    expect(teamSummaryFor(rows, "Luke")).toEqual({
      team: "Luke", size: 2, avgPct: 40, rank: 2, teamCount: 2,
    });
  });

  it("returns null for an unknown or empty team", () => {
    expect(teamSummaryFor(rows, "Nope")).toBeNull();
    expect(teamSummaryFor(rows, "")).toBeNull();
  });
});

describe("teamMembers", () => {
  const roster = [
    { id: "a", name: "Amanda Silva", team: "Luke", pct: 40 },
    { id: "b", name: "Bea Cole", team: "Cooper", pct: 90 },
    { id: "c", name: "Carl Ruiz", team: "Luke", pct: 0 },
    { id: "d", name: "Dana West", team: "Luke", pct: 80 },
    { id: "e", name: "Eli Novak", team: "", pct: 95 },
  ];

  it("returns one team's reps, highest percentage first", () => {
    expect(teamMembers(roster, "Luke").map((r) => r.id)).toEqual(["d", "a", "c"]);
  });

  it("includes not-started members, so the list can produce the team average", () => {
    const members = teamMembers(roster, "Luke");
    expect(members).toHaveLength(3);
    expect(members.some((r) => r.pct === 0)).toBe(true);
    // The card shows avgPct over the same three, so list and number must agree.
    expect(teamStandings(roster).find((s) => s.team === "Luke")?.size).toBe(members.length);
  });

  it("breaks a tie on name so the order never shuffles between renders", () => {
    const tied = [
      { name: "Zoe Park", team: "Luke", pct: 50 },
      { name: "Adam Fry", team: "Luke", pct: 50 },
    ];
    expect(teamMembers(tied, "Luke").map((r) => r.name)).toEqual(["Adam Fry", "Zoe Park"]);
  });

  it("returns nothing for an unknown team, and never groups the teamless", () => {
    expect(teamMembers(roster, "Nope")).toEqual([]);
    expect(teamMembers(roster, "")).toEqual([]);
  });

  it("does not reorder the array it was given", () => {
    const before = roster.map((r) => r.id);
    teamMembers(roster, "Luke");
    expect(roster.map((r) => r.id)).toEqual(before);
  });
});

describe("weekStartMonday", () => {
  it("maps every weekday to that week's Monday at UTC midnight", () => {
    // Wed 2026-07-22 15:30 UTC -> Mon 2026-07-20 00:00 UTC
    expect(weekStartMonday(new Date(Date.UTC(2026, 6, 22, 15, 30))).toISOString()).toBe(
      "2026-07-20T00:00:00.000Z"
    );
    // Monday maps to itself
    expect(weekStartMonday(new Date(Date.UTC(2026, 6, 20, 0, 0))).toISOString()).toBe(
      "2026-07-20T00:00:00.000Z"
    );
  });

  it("maps Sunday to the PREVIOUS Monday (weeks start Monday)", () => {
    // Sun 2026-07-26 -> Mon 2026-07-20
    expect(weekStartMonday(new Date(Date.UTC(2026, 6, 26, 10, 0))).toISOString()).toBe(
      "2026-07-20T00:00:00.000Z"
    );
  });

  it("crosses month boundaries correctly", () => {
    // Sat 2026-08-01 -> Mon 2026-07-27
    expect(weekStartMonday(new Date(Date.UTC(2026, 7, 1))).toISOString()).toBe(
      "2026-07-27T00:00:00.000Z"
    );
  });
});

describe("computeRankDeltas", () => {
  const prev = [
    { userId: "a", rank: 5 },
    { userId: "b", rank: 2 },
    { userId: "c", rank: 3 },
  ];

  it("is positive moving up and negative moving down", () => {
    const d = computeRankDeltas(
      [
        { id: "a", rank: 2 },
        { id: "b", rank: 4 },
      ],
      prev
    );
    expect(d.get("a")).toBe(3);
    expect(d.get("b")).toBe(-2);
  });

  it("is 0 when unchanged and null for a rep with no previous rank", () => {
    const d = computeRankDeltas(
      [
        { id: "c", rank: 3 },
        { id: "new", rank: 1 },
      ],
      prev
    );
    expect(d.get("c")).toBe(0);
    expect(d.get("new")).toBeNull();
  });

  it("is null for unranked (not started) rows and when there is no previous week", () => {
    expect(computeRankDeltas([{ id: "a", rank: null }], prev).get("a")).toBeNull();
    expect(computeRankDeltas([{ id: "a", rank: 1 }], []).get("a")).toBeNull();
  });
});

describe("courseHeaderStats", () => {
  it("counts starters and averages across ALL reps, zeros included", () => {
    const s = courseHeaderStats([
      { done: 10, pct: 50 },
      { done: 1, pct: 10 },
      { done: 0, pct: 0 },
    ]);
    expect(s.started).toBe(2);
    expect(s.total).toBe(3);
    expect(s.avgPct).toBe(20);
  });

  it("handles an empty roster", () => {
    expect(courseHeaderStats([])).toEqual({ started: 0, total: 0, avgPct: 0 });
  });
});
