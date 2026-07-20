import { describe, it, expect } from "vitest";
import {
  aggregateOverall,
  nextMilestone,
  rankRequirementLabels,
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
