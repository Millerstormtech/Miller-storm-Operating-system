// Pure helpers for the Course Leaderboard Overall board. Same contract as
// scoring.ts: no database, no React, no I/O. The API route and the UI both
// import from here so the board can never disagree with itself.

import type { CourseStats, RankTitle, BadgeId } from "./scoring";

export type OverallAggregate = {
  itemsCompleted: number;
  itemsTotal: number;
  videosWatched: number;
  quizzesPassed: number;
  coursesCompleted: number;
  pct: number;
  hasTestAce: boolean;
  started: boolean;
};

/** One rep's standing across the WHOLE library: sum of their per-course stats. */
export function aggregateOverall(stats: CourseStats[]): OverallAggregate {
  let itemsCompleted = 0;
  let itemsTotal = 0;
  let videosWatched = 0;
  let quizzesPassed = 0;
  let coursesCompleted = 0;
  let hasTestAce = false;
  for (const s of stats) {
    itemsCompleted += s.itemsCompleted;
    itemsTotal += s.itemsTotal;
    videosWatched += s.videosWatched;
    quizzesPassed += s.quizzesPassed;
    if (s.complete) coursesCompleted++;
    if (s.finalTestPerfect) hasTestAce = true;
  }
  return {
    itemsCompleted,
    itemsTotal,
    videosWatched,
    quizzesPassed,
    coursesCompleted,
    pct: itemsTotal > 0 ? Math.round((itemsCompleted / itemsTotal) * 100) : 0,
    hasTestAce,
    started: itemsCompleted > 0,
  };
}

/**
 * The nearest reachable target for the "Your rank" strip. Copy uses
 * parentheses, never em dashes. Null when there is nothing left to chase.
 */
export function nextMilestone(coursesCompleted: number, totalCourses: number): string | null {
  if (totalCourses <= 0 || coursesCompleted >= totalCourses) return null;
  if (coursesCompleted === 0) return "Finisher 🏁 (finish your first course)";
  const more = (n: number) => `finish ${n} more course${n === 1 ? "" : "s"}`;
  const tiers: Array<[number, string]> = [
    [3, "Pro"],
    [5, "Ace"],
    [7, "Elite"],
  ];
  for (const [threshold, title] of tiers) {
    if (coursesCompleted < threshold && threshold < totalCourses) {
      return `${title} rank (${more(threshold - coursesCompleted)})`;
    }
  }
  return `Legend 🌟 (${more(totalCourses - coursesCompleted)})`;
}

/**
 * Legend-panel labels for each rank, computed from the real course count so a
 * grown library never shows a stale "all 10".
 */
export function rankRequirementLabels(totalCourses: number): Record<RankTitle, string> {
  return {
    Rookie: "0 courses",
    Rising: "1 to 2",
    Pro: "3 to 4",
    Ace: "5 to 6",
    Elite: `7 to ${Math.max(7, totalCourses - 1)}`,
    Legend: `all ${totalCourses}`,
  };
}

/** One row of the Overall board. Produced by /api/training/leaderboard. */
export type OverallRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  headshotUrl: string;
  branch: string;
  team: string;
  itemsCompleted: number;
  videosWatched: number;
  quizzesPassed: number;
  coursesCompleted: number;
  pct: number;
  rankTitle: RankTitle;
  badges: BadgeId[];
  /** Company-wide rank among started reps; null when notStarted. */
  rank: number | null;
  /** True for the company-wide top 3. Derived, never persisted. */
  isPodium: boolean;
  notStarted: boolean;
};

export type OverallResponse = {
  totalCourses: number;
  totalItems: number;
  courses: Array<{ id: string; title: string }>;
  rows: OverallRow[];
};
