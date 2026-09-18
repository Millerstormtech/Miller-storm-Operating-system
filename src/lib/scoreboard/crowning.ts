// When to play a celebration, and what it says. Pure: no database, no React, so
// the API and the screen can never disagree about whether something is worth
// celebrating (CLAUDE.md convention).
//
// Two moments live here:
//   - the monthly crowning, which really happens once a month on the server
//     (MonthlyKingAnnouncement, written by the 1st-of-month cron), and
//   - a rep's own contract count going up since the last time they looked.

/** The crowning the server has already announced. Null until the first one. */
export type Crowning = {
  month: string;        // "2026-08"
  repName: string;
  revenue: number;
  /** Decided on the server: the crowning row names a leaderboard row, not an
   *  account, so only the endpoint can tell whether the viewer is the king. */
  isViewer: boolean;
};

export type MomentCopy = { mark: string; title: string; line: string };

/** Show a crowning once per person per month: only when one exists and this
 *  viewer has not already seen that month's. A viewer who has never seen one
 *  (seenMonth null) does get the newest, which is the point of the ceremony. */
export function shouldCelebrateCrowning(crowning: Crowning | null, seenMonth: string | null): boolean {
  if (!crowning || !crowning.month) return false;
  return crowning.month !== seenMonth;
}

/** The month key as people read it: "2026-08" becomes "August 2026". */
export function crowningMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const index = Number(m) - 1;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return names[index] ? `${names[index]} ${year}` : month;
}

/** Being crowned is a different sentence from watching someone else be crowned. */
export function crowningCopy(crowning: Crowning): MomentCopy {
  const label = crowningMonthLabel(crowning.month);
  if (crowning.isViewer) {
    return { mark: "\u{1F451}", title: "You are Contract King", line: `${label}. Nobody in the company signed more.` };
  }
  return { mark: "\u{1F451}", title: `${crowning.repName} is Contract King`, line: `${label}. Beat that this month.` };
}

/** How many contracts a rep has gained since their last visit. Zero unless we
 *  have something real to compare against: a first visit on a device stores the
 *  count quietly, and a count that drops (a voided deal, a scope change) is
 *  never celebrated. */
export function contractsGained(previous: number | null, current: number): number {
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  const gained = Math.floor(current) - Math.floor(previous);
  return gained > 0 ? gained : 0;
}

export function contractCopy(gained: number, totalThisYear: number): MomentCopy {
  const title = gained === 1 ? "Contract signed" : `${gained} contracts signed`;
  return { mark: "\u{1F4B0}", title, line: `That puts you on ${totalThisYear} this year.` };
}
