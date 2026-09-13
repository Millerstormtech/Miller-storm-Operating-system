// The dashboard's "Lowest knocks" card: the three reps in the viewer's scope with
// the fewest verified door knocks over the last seven complete days.
//
// Pure: no database, no React, no I/O. The API gathers the rows; the rules that
// decide who is named live here with their tests, because a card that calls out
// named reps to their manager has to be right about who it names.
//
// Rules agreed with Youssef on 2026-09-13:
//   - knocks only, over the last 7 COMPLETE days ending yesterday, Central time.
//     Today is left out so the list does not shift hour by hour, and a 7-day
//     window always holds exactly one Sunday, so nobody is penalised for theirs.
//   - former reps (deactivated in RepCard) are never named.
//   - new reps are left out until they have knocked for a full window: anyone
//     whose first knock falls after the window opened.
//   - ties go to whoever has gone longest without a knock, then by name.
// Added 2026-09-13 after a live-data check named the wrong people:
//   - anyone with no knock in the 30 days ending yesterday is left out. On live data
//     the card was full of reps who stopped knocking in June and July but were
//     never deactivated in RepCard; they have left, they are not "low".
//   - team leads (branch managers included, they lead a team too) are left out.
//     The card is about reps; leaders mostly do not knock.
// Sales reps never get this card; that is decided by the API, not here.
import { centralDateStr } from "../acculynx/windows";

export interface KnockCandidate {
  /** Leaderboard row id, e.g. "rc:<repcardUserId>". */
  id: string;
  repUserId: string | null;
  name: string;
  /** Verified knocks inside the window. */
  knocks: number;
  former: boolean;
  /** Leads a team (org chart). Branch managers lead one too. */
  isTeamLead: boolean;
  /** First and last days with a verified knock, as Central YYYY-MM-DD. */
  firstKnockDay: string | null;
  lastKnockDay: string | null;
}

export interface LowKnocker {
  id: string;
  repUserId: string | null;
  name: string;
  knocks: number;
  lastKnockDay: string | null;
}

/** Shift a YYYY-MM-DD calendar date by whole days (UTC arithmetic, no DST drift). */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** The last `days` complete Central days, ending yesterday. */
export function lastCompleteDays(now: Date, days = 7): { from: string; to: string } {
  const to = shiftDay(centralDateStr(now), -1);
  return { from: shiftDay(to, -(days - 1)), to };
}

/** How long without a single knock before a rep is treated as gone, not low. */
export const STALE_DAYS = 30;

export function lowestKnocks(rows: KnockCandidate[], window: { from: string; to: string }, n = 3): LowKnocker[] {
  // Last day of the 30-day lookback that ends on the window's last day.
  const staleBefore = shiftDay(window.to, -(STALE_DAYS - 1));
  return rows
    // A rep with no recorded first knock cannot be shown to have been knocking
    // for the whole window, so they are treated like a new rep, not as a zero.
    .filter((r) => !r.former && r.firstKnockDay != null && r.firstKnockDay <= window.from)
    .filter((r) => !r.isTeamLead)
    .filter((r) => r.lastKnockDay != null && r.lastKnockDay >= staleBefore)
    .sort(
      (a, b) =>
        a.knocks - b.knocks ||
        // YYYY-MM-DD compares correctly as text; the older last knock goes first.
        (a.lastKnockDay ?? "").localeCompare(b.lastKnockDay ?? "") ||
        a.name.localeCompare(b.name)
    )
    .slice(0, Math.max(0, n))
    .map((r) => ({
      id: r.id,
      repUserId: r.repUserId,
      name: r.name,
      knocks: r.knocks,
      lastKnockDay: r.lastKnockDay,
    }));
}
