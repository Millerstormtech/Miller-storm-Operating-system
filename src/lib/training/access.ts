/**
 * Roles that review training freely: every lesson and quiz is open (no
 * in-order lock) and videos can be fast-forwarded without being completed
 * first. Sales reps are the only learners still taken through in order.
 *
 * Marketing joined the leadership roles on 2026-10-15 (Nadine's ask). Marketing
 * is not on the Course Leaderboard, so a skipped video ranks no one.
 *
 * The phone app keeps its own copy of this list (`_isPrivileged` in
 * Jamesapk/lib/screens/course_detail_screen.dart); change both together.
 */
export const OPEN_TRAINING_ROLES = [
  "admin",
  "c-level",
  "branch-manager",
  "sales-team-lead",
  "marketing",
] as const;

export function opensAllTraining(role?: string | null): boolean {
  return (OPEN_TRAINING_ROLES as readonly string[]).includes(role || "");
}
