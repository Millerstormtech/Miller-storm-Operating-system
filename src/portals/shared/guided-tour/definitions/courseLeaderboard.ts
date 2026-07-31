import type { TourDefinition } from "../types";

/**
 * Wave 2. Orientation for the Course Leaderboard, shared by all five role
 * routes (sales, manager, c-level, branch-manager, admin/training-executive)
 * because they all mount the one TrainingLeaderboard component.
 *
 * Steps spend attention on what cannot be discovered by looking: a rep card
 * looks like a display element but opens a course-by-course breakdown, and the
 * Overall / By Course toggle is easy to never notice. Labelled panels like My
 * Team are deliberately skipped.
 *
 * Step order is the screen's real top-to-bottom order (toggle, legend, rank
 * strip, roster), so the tour walks down the page instead of jumping back up.
 * This differs from the order tabled in the 2026-07-28 design spec, which
 * listed the rank strip first while describing itself as page order; the two
 * conflicted because FiltersBar and Legend actually render above the rank
 * strip. Youssef chose page order on 2026-07-30. It matters because the engine
 * calls scrollIntoView on every step, so a mismatched order visibly yo-yos.
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
      target: "clb-legend",
      title: "The full rules",
      body: "Open this anytime for the details, like what it takes to reach each rank.",
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
