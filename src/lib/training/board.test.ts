import { describe, it, expect } from "vitest";
import {
  aggregateOverall,
  nextMilestone,
  rankRequirementLabels,
  filterRows,
  filtersActive,
  teamStandings,
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

describe("nextMilestone", () => {
  it("targets the first Finisher for a rep with zero completed courses", () => {
    expect(nextMilestone(0, 10)).toBe("Finisher 🏁 (finish your first course)");
  });

  it("targets Pro from 1 or 2 courses", () => {
    expect(nextMilestone(1, 10)).toBe("Pro rank (finish 2 more courses)");
    expect(nextMilestone(2, 10)).toBe("Pro rank (finish 1 more course)");
  });

  it("targets Ace, then Elite, then Legend", () => {
    expect(nextMilestone(4, 10)).toBe("Ace rank (finish 1 more course)");
    expect(nextMilestone(6, 10)).toBe("Elite rank (finish 1 more course)");
    expect(nextMilestone(8, 10)).toBe("Legend 🌟 (finish 2 more courses)");
  });

  it("returns null for a Legend and for an empty library", () => {
    expect(nextMilestone(10, 10)).toBeNull();
    expect(nextMilestone(0, 0)).toBeNull();
  });
});

describe("rankRequirementLabels", () => {
  it("computes Elite and Legend bounds from the real course count", () => {
    const labels = rankRequirementLabels(10);
    expect(labels.Rookie).toBe("0 courses");
    expect(labels.Rising).toBe("1 to 2");
    expect(labels.Pro).toBe("3 to 4");
    expect(labels.Ace).toBe("5 to 6");
    expect(labels.Elite).toBe("7 to 9");
    expect(labels.Legend).toBe("all 10");
  });

  it("keeps working if the library grows", () => {
    const labels = rankRequirementLabels(12);
    expect(labels.Elite).toBe("7 to 11");
    expect(labels.Legend).toBe("all 12");
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
