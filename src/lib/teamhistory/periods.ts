// src/lib/teamhistory/periods.ts
// Pure, no I/O. A rep's team history is an ordered list of periods, each a
// stretch of Central calendar days in one placement (team + branch). Numbers are
// credited to the period covering the day they happened (segments.ts).
// Spec: docs/superpowers/specs/2026-10-07-team-history-um-design.md.

export type PeriodSource = "initial" | "sync" | "backup" | "admin";
/** Team = the lead's full name, as every board names it; "" = no team. */
export interface Placement { team: string; branch: string }
export interface Period { team: string; branch: string; from: string; to: string | null; source: PeriodSource }

/** The syncs reach back to January 1, so no history is needed before it. */
export const HISTORY_START = "2026-01-01";

export class HistoryEditError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

const samePlace = (a: Placement, b: Placement) => a.team === b.team && a.branch === b.branch;

export function currentPeriod(periods: readonly Period[]): Period | null {
  const last = periods[periods.length - 1];
  return last && last.to === null ? last : null;
}

export function periodsOverlapping(periods: readonly Period[], from: string, to: string): Period[] {
  return periods.filter((p) => p.from <= to && (p.to ?? "9999-12-31") >= from);
}

export function samePeriods(a: readonly Period[], b: readonly Period[]): boolean {
  return a.length === b.length && a.every((p, i) =>
    p.team === b[i].team && p.branch === b[i].branch && p.from === b[i].from && p.to === b[i].to && p.source === b[i].source);
}

/**
 * Apply today's placement to a history. Returns the SAME array when nothing
 * changes, so callers skip the write with a reference check.
 *
 * No team is an ordinary placement (D9): a rep taken off the sales side counts
 * for no team from that day. A second change on the same day retargets today's
 * period; changing back the same day reopens the earlier period.
 */
export function advanceHistory(
  periods: readonly Period[],
  placement: Placement,
  today: string,
  source: PeriodSource = "sync"
): Period[] {
  const yesterday = shiftDay(today, -1);
  if (periods.length === 0) {
    return [{ team: placement.team, branch: placement.branch, from: HISTORY_START, to: null, source: "initial" }];
  }
  const open = currentPeriod(periods);
  if (!open) return [...periods, { team: placement.team, branch: placement.branch, from: today, to: null, source }];
  if (samePlace(open, placement)) return periods as Period[];

  if (open.from === today) {
    const prev = periods[periods.length - 2];
    if (prev && prev.to === yesterday && samePlace(prev, placement)) {
      return [...periods.slice(0, -2), { ...prev, to: null }];
    }
    return [...periods.slice(0, -1), { ...open, team: placement.team, branch: placement.branch, source }];
  }
  return [
    ...periods.slice(0, -1),
    { ...open, to: yesterday },
    { team: placement.team, branch: placement.branch, from: today, to: null, source },
  ];
}

/** null when valid, else a short reason code. Gaps are allowed. */
export function validateHistory(periods: readonly Period[]): string | null {
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (p.to !== null && p.to < p.from) return "inverted";
    if (i > 0) {
      const prev = periods[i - 1];
      if (prev.to === null) return "open-not-last";
      if (p.from <= prev.to) return "overlap";
    }
  }
  return null;
}

/** Move the day periods[index] starts (and periods[index-1] ends). */
export function moveBoundary(periods: readonly Period[], index: number, newFrom: string, today: string): Period[] {
  if (index < 1 || index >= periods.length) throw new HistoryEditError("no-previous", "There is no earlier period to move this date against.");
  if (newFrom > today) throw new HistoryEditError("future", "A move cannot be dated in the future.");
  const prev = periods[index - 1];
  const cur = periods[index];
  if (newFrom <= prev.from) throw new HistoryEditError("crosses-previous", "That date is before the previous move.");
  if (cur.to !== null && newFrom > cur.to) throw new HistoryEditError("crosses-next", "That date is after the next move.");
  if (prev.to !== shiftDay(cur.from, -1)) throw new HistoryEditError("not-adjacent", "These two periods do not touch, so there is no single move date to change.");
  const out = periods.map((p) => ({ ...p }));
  out[index - 1].to = shiftDay(newFrom, -1);
  out[index].from = newFrom;
  out[index].source = "admin";
  return out;
}

/** Record a move that happened before recording began: `earlier` until date-1. */
export function addPastMove(
  periods: readonly Period[],
  date: string,
  earlier: Placement,
  today: string,
  source: PeriodSource = "admin"
): Period[] {
  if (date > today) throw new HistoryEditError("future", "A move cannot be dated in the future.");
  const i = periods.findIndex((p) => p.from <= date && (p.to ?? "9999-12-31") >= date);
  if (i < 0) throw new HistoryEditError("no-period", "The rep has no team on that date.");
  const p = periods[i];
  if (p.from === date) throw new HistoryEditError("period-start", "A move already starts on that date. Change that move's date instead.");
  if (samePlace(p, earlier)) throw new HistoryEditError("same-team", "The rep was already on that team then.");
  return [
    ...periods.slice(0, i),
    { team: earlier.team, branch: earlier.branch, from: p.from, to: shiftDay(date, -1), source },
    { ...p, from: date },
    ...periods.slice(i + 1),
  ];
}

/** One hourly pass. Pure: the caller loads and saves. Reps with no placement are left alone. */
export function planRecording(input: {
  histories: ReadonlyMap<string, Period[]>;
  placements: ReadonlyMap<string, Placement>;
  today: string;
}): Map<string, Period[]> {
  const changed = new Map<string, Period[]>();
  for (const [id, placement] of input.placements) {
    const before = input.histories.get(id) || [];
    const after = advanceHistory(before, placement, input.today);
    if (after !== before) changed.set(id, after);
  }
  return changed;
}

/**
 * Which warnings to store and email. Each key is emailed once; a solved one is
 * deactivated and emailed again only if it comes back. The very first run
 * stores everything as already known, so deploy day sends no backlog.
 */
export function diffWarnings(
  existing: ReadonlyArray<{ key: string; active: boolean; emailedAt: Date | null }>,
  current: ReadonlyArray<{ key: string }>,
  firstRun: boolean
): { toCreate: string[]; toReactivate: string[]; toDeactivate: string[]; toEmail: string[] } {
  const byKey = new Map(existing.map((w) => [w.key, w]));
  const now = new Set(current.map((w) => w.key));
  const toCreate = [...now].filter((k) => !byKey.has(k));
  const toReactivate = [...now].filter((k) => byKey.has(k) && !byKey.get(k)!.active);
  const toDeactivate = existing.filter((w) => w.active && !now.has(w.key)).map((w) => w.key);
  // Emailing is driven by emailedAt: a warning still current and never marked
  // sent is retried every hour until a send succeeds.
  const unsent = [...now].filter((k) => byKey.has(k) && byKey.get(k)!.active && byKey.get(k)!.emailedAt === null);
  return { toCreate, toReactivate, toDeactivate, toEmail: firstRun ? [] : [...toCreate, ...toReactivate, ...unsent] };
}

/**
 * D9 stickiness: an active "no-team-numbers:<id>" warning stays current while
 * that person still has a live account with no team, even in a month with no
 * numbers yet, so it does not deactivate on the 1st and re-email later.
 */
export function stickyNoTeamKeys(
  existing: ReadonlyArray<{ key: string; active: boolean }>,
  noTeamUserIds: ReadonlySet<string>
): string[] {
  const prefix = "no-team-numbers:";
  return existing
    .filter((w) => w.active && w.key.startsWith(prefix) && noTeamUserIds.has(w.key.slice(prefix.length)))
    .map((w) => w.key);
}

export const NO_TEAM_NUMBERS_TEXT = "Their numbers do not count for any team or branch.";
