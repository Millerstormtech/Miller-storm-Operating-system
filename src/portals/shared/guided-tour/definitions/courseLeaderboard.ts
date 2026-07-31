import type { TourDefinition } from "../types";

/**
 * Wave 2. Orientation for the Course Leaderboard, shared by all five role
 * routes (sales, manager, c-level, branch-manager, admin/training-executive)
 * because they all mount the one TrainingLeaderboard component.
 *
 * Steps spend attention on what cannot be discovered by looking: a rep card
 * looks like a display element but opens a course-by-course breakdown, and the
 * Overall / By Course toggle is easy to never notice.
 *
 * Step order is the screen's real top-to-bottom order, so the tour walks down
 * the page instead of jumping back up. This matters because the engine calls
 * scrollIntoView on every step. The 2026-07-28 design spec tabled a different
 * order while describing itself as page order; the two conflicted, and Youssef
 * chose page order on 2026-07-30. The spec has been annotated as superseded.
 *
 * Written for 5 steps, now 7: the board gained an Export report button and a
 * Team standings panel after the spec was approved. Both are added here.
 *
 * The visible count is role-dependent and handled entirely by the engine's
 * existing skip rule, with no branching in this file:
 *   sales rep       -> no Export (not in EXPORT_ROLES), so 6 steps
 *   admin/marketing -> no rank strip (isRankedRole is false), so 6 steps
 *   By Course view  -> no rank strip and no roster, so 5 steps
 */
export const COURSE_LEADERBOARD_TOUR: TourDefinition = {
  id: "course-leaderboard",
  version: 1,
  steps: [
    {
      target: "clb-views",
      title: "Two ways to look",
      body: "Overall ranks everyone across all courses. By Course shows who has finished one specific course.",
    },
    {
      // Only admin, c-level, branch-manager and sales-team-lead can export, so
      // this step is simply absent for a sales rep. No role check needed here.
      target: "clb-export",
      title: "Export a report",
      body: "Turn the board you are looking at into a PDF you can email or print. It records which filters were on, so it still makes sense months later.",
    },
    {
      target: "clb-legend",
      title: "The full rules",
      body: "Open this anytime for the details, like what it takes to reach each rank.",
    },
    {
      target: "clb-standings",
      title: "Team standings",
      body: "Teams ranked by average progress through the library. Choosing a branch hides other branches' teams, and everyone keeps their real rank.",
    },
    {
      target: "clb-rank",
      title: "Your standing",
      body: "This strip shows your rank and how far through the course library you are.",
    },
    {
      target: "clb-roster",
      title: "Everyone's progress",
      body: "Each card shows a rep's progress and badges. Click any rep to see their course by course breakdown.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
