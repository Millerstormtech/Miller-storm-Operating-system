import type { TourDefinition } from "../types";

/** Step order follows the on-screen order (rank, filters, guide, legend, table)
 *  so the tour walks down the page instead of jumping back up. */
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
      body: "Pick a time period or a custom date range, or narrow the board to one branch, one team, or specific reps.",
    },
    {
      target: "board-guide",
      title: "The full rules",
      body: "Open this guide anytime for the details, like how branch filtering changes the numbers.",
    },
    {
      target: "legend",
      title: "The flags",
      body: "An orange dot means the rep has no AccuLynx account yet. An X marks a former rep.",
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
