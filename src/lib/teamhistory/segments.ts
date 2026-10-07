// src/lib/teamhistory/segments.ts
// Pure, no I/O. Splits a rep's numbers for a range into SEGMENTS, one per
// history period overlapping the range, each credited to that period's team and
// branch. Segment totals always sum to the rep's full totals: a day before the
// first period or in a gap goes to the nearest EARLIER period, else the first.
import { periodsOverlapping, type Period } from "./periods";

export interface Metrics { verifiedKnocks: number; leadsCreated: number; filed: number; won: number; revenue: number }
export interface DayTotals extends Metrics { day: string }
export interface Placed { team: string; branch: string; from: string; to: string }
export interface Segment extends Metrics, Placed {}

const ZERO: Metrics = { verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: 0, revenue: 0 };
const KEYS = Object.keys(ZERO) as (keyof Metrics)[];

function clip(p: Period, range: { from: string; to: string }): Placed {
  return {
    team: p.team,
    branch: p.branch,
    from: p.from > range.from ? p.from : range.from,
    to: (p.to ?? "9999-12-31") < range.to ? (p.to as string) : range.to,
  };
}

export function wholeSegment(
  totals: Metrics,
  periods: readonly Period[],
  range: { from: string; to: string },
  fallback: { team: string; branch: string }
): Segment {
  const within = periodsOverlapping(periods, range.from, range.to);
  const place = within.length ? clip(within[within.length - 1], range) : { ...fallback, from: range.from, to: range.to };
  const out = { ...place } as Segment;
  for (const k of KEYS) out[k] = totals[k] || 0;
  return out;
}

export function splitIntoSegments(
  days: readonly DayTotals[],
  periods: readonly Period[],
  range: { from: string; to: string },
  fallback: { team: string; branch: string }
): Segment[] {
  const within = periodsOverlapping(periods, range.from, range.to);
  if (within.length === 0) {
    const sum = { ...ZERO };
    for (const d of days) for (const k of KEYS) sum[k] += d[k] || 0;
    return [wholeSegment(sum, [], range, fallback)];
  }
  const segs: Segment[] = within.map((p) => ({ ...clip(p, range), ...ZERO }));
  for (const d of days) {
    let idx = 0;
    for (let i = 0; i < within.length; i++) if (within[i].from <= d.day) idx = i;
    for (const k of KEYS) segs[idx][k] += d[k] || 0;
  }
  return segs;
}

export function pickSegments<S extends Placed>(
  segments: readonly S[],
  match: (s: Placed) => boolean
): { inScope: S[]; movedOut: { team: string; branch: string; on: string } | null; joined: { from: string } | null } {
  const idx = segments.map((s, i) => (match(s) ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) return { inScope: [], movedOut: null, joined: null };
  const first = idx[0];
  const last = idx[idx.length - 1];
  const next = segments[last + 1];
  return {
    inScope: idx.map((i) => segments[i]),
    movedOut: next ? { team: next.team, branch: next.branch, on: next.from } : null,
    joined: first > 0 ? { from: segments[first].from } : null,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** The grey note under a rep's name in a team/branch view (team = lead's name). */
export function moveNote(tags: { movedOut: { team: string; on: string } | null; joined: { from: string } | null }): string {
  if (tags.movedOut) {
    return tags.movedOut.team
      ? `Moved to ${tags.movedOut.team}, ${shortDate(tags.movedOut.on)}`
      : `Left the team, ${shortDate(tags.movedOut.on)}`;
  }
  if (tags.joined) return `Joined ${shortDate(tags.joined.from)}`;
  return "";
}
