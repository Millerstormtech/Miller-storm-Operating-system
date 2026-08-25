import type { TourDefinition } from "../types";

/** Step order follows the on-screen order (rank, filters, table, replay button)
 *  so the tour walks down the page instead of jumping back up. The "How to read
 *  this board" guide it used to stop at was removed once branch reporting became
 *  team-based: the rules it explained (a rep's numbers splitting across branches)
 *  no longer exist, and what remained fits in the filters step above. */
export const SALES_LEADERBOARD_TOUR: TourDefinition = {
  id: "sales-leaderboard",
  version: 1,
  steps: [
    {
      target: "your-rank",
      title: "Your standing",
      body: "This banner shows your rank and totals for the selected period. It refreshes every 30 minutes.",
    },
    {
      target: "filters",
      title: "Filter the board",
      body: "Pick a time period or a custom date range, or narrow the board to one branch, one team, or specific reps. Filtering by branch lists that branch's own reps with their full numbers.",
    },
    {
      target: "columns",
      title: "Sort any column",
      body: "Click a column name to sort by it, and click again to flip the order. The blue column is the current sort.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
