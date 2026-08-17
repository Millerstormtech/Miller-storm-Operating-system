// Per-credential progress for the Course Leaderboard's Triple Track row.
// Pure: no database, no React, no I/O. The API route and the UI both import
// from here so a rep's three bars can never disagree with the board.
//
// Approved 2026-08-15. The design is in docs/design/2026-08-13-course-awards.

import type { CourseStats } from "./scoring";

export type CredentialKey = "diploma" | "knockers" | "hustlers";

/**
 * The three credentials, in the order they are drawn on a row.
 *
 * `category` MUST match the strings in categories.ts exactly: that field is
 * what the Course Builder writes onto each course, and it is the only link
 * between a course and a credential.
 *
 * `label` is the user-facing name and is deliberately the ONLY place it
 * appears. The printed certificates use "Millionaire Knockers" and "Roof
 * Hustlers" while the Course Builder categories still say "Matt Mulholland
 * Certificate" and "DeShaun Bryant (Roof Hustlers) Certificate"; Jay has not
 * settled which wins. Changing a label here changes it everywhere on the board
 * without touching the stored category on any course.
 */
export const CREDENTIALS: ReadonlyArray<{
  key: CredentialKey;
  category: string;
  label: string;
  short: string;
}> = [
  { key: "diploma", category: "Miller Storm Diploma", label: "Miller Storm Diploma", short: "Diploma" },
  { key: "knockers", category: "Matt Mulholland Certificate", label: "Millionaire Knockers", short: "Knockers" },
  {
    key: "hustlers",
    category: "DeShaun Bryant (Roof Hustlers) Certificate",
    label: "Roof Hustlers",
    short: "Hustlers",
  },
];

export type CredentialProgress = {
  key: CredentialKey;
  /** Items done and total WITHIN this credential only. */
  itemsCompleted: number;
  itemsTotal: number;
  /** 0..100 over this credential's courses alone, never the whole library. */
  pct: number;
  coursesCompleted: number;
  coursesTotal: number;
  /** Every course in this credential complete. False when it holds no courses. */
  earned: boolean;
};

type CourseLike = { id: string; category?: string };

/**
 * One rep's progress through each credential.
 *
 * Counting is per credential ONLY: the diploma bar divides by the diploma's
 * own items, not by the library. This is why the three bars and the overall
 * bar do not add up and must not be expected to, and it is the whole point of
 * the row: a rep can be 86% overall while holding two credentials outright,
 * because the third has barely started.
 *
 * `courses` should already exclude hidden courses. The caller loads published
 * courses only, so a hidden course contributes nothing to any credential and
 * nothing to the overall bar either. That was the decision on 2026-08-15:
 * otherwise every rep's percentage drops for a course nobody can open.
 *
 * A credential holding zero courses reports 0% and earned:false rather than
 * 100%. An empty set is not an achievement, and a category can legitimately be
 * empty while an admin is still filling it in.
 */
export function credentialProgress(
  courses: CourseLike[],
  statsByCourseId: Map<string, CourseStats>
): CredentialProgress[] {
  return CREDENTIALS.map((cred) => {
    const mine = courses.filter((c) => (c.category || "").trim() === cred.category);
    let itemsCompleted = 0;
    let itemsTotal = 0;
    let coursesCompleted = 0;
    for (const c of mine) {
      const s = statsByCourseId.get(c.id);
      if (!s) continue;
      itemsCompleted += s.itemsCompleted;
      itemsTotal += s.itemsTotal;
      if (s.complete) coursesCompleted++;
    }
    return {
      key: cred.key,
      itemsCompleted,
      itemsTotal,
      pct: itemsTotal > 0 ? Math.round((itemsCompleted / itemsTotal) * 100) : 0,
      coursesCompleted,
      coursesTotal: mine.length,
      earned: mine.length > 0 && coursesCompleted === mine.length,
    };
  });
}

/**
 * The credential a rep is closest to finishing, phrased for the "Your rank"
 * strip. Null when every credential is earned, or when none holds a course.
 *
 * Replaces nextMilestone(), which chased the retired Rookie-to-Legend ladder.
 * "Closest" is by percentage, not by courses remaining: a rep two long courses
 * from one credential and one barely-started course from another is genuinely
 * nearer the first, and percentage is the figure already on their row.
 *
 * Ties break by row order, so the diploma is offered before the certificates.
 * Copy uses parentheses, never em dashes.
 */
export function nextCredential(progress: CredentialProgress[]): string | null {
  const chaseable = progress.filter((c) => c.coursesTotal > 0 && !c.earned);
  if (chaseable.length === 0) return null;
  const order = new Map(CREDENTIALS.map((c, i) => [c.key, i]));
  const best = chaseable.reduce((a, b) =>
    b.pct > a.pct || (b.pct === a.pct && (order.get(b.key) ?? 0) < (order.get(a.key) ?? 0)) ? b : a
  );
  const label = CREDENTIALS.find((c) => c.key === best.key)?.label || best.key;
  const left = best.coursesTotal - best.coursesCompleted;
  return `${label} (${left} course${left === 1 ? "" : "s"} left)`;
}
