/** Where the step card sits relative to its spotlighted target. */
export type Placement = "top" | "bottom" | "left" | "right";

/** A viewport-relative rectangle, the shape getBoundingClientRect returns. */
export type Rect = { top: number; left: number; width: number; height: number };

export type TourStep = {
  /** Matches a data-tour attribute on the screen, e.g. "your-rank". */
  target: string;
  /** Short, bold. */
  title: string;
  /** One to two plain sentences. No em dashes. */
  body: string;
  /** Defaults to automatic: the side with the most free space. */
  placement?: Placement;
};

export type TourDefinition = {
  /** Storage identity, e.g. "sales-leaderboard". NEVER renamed: renaming it
   *  orphans every user's seen-record and re-shows the tour to everyone. */
  id: string;
  /** Bump by one to re-show this tour to every user after a redesign. */
  version: number;
  steps: TourStep[];
};
