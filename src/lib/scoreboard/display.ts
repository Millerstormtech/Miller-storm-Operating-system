// Pure presentation helpers for the scoreboard screens: bar geometry, formatting,
// and the "do we have enough to say anything" judgements. No database, no React,
// no I/O, no clock reads -- every decision here is a function of its arguments so
// it can be verified without a browser (this repo has no jsdom).
//
// The floor rule that decides whether a conversion rate is trustworthy enough to
// show already lives in ./metrics (conversions()), which sets `hidden`. This module
// does not re-derive that judgement -- it only renders the flag it is handed, so
// there is exactly one place that decides "is this enough data" and one place that
// decides "how does a percentage look on screen".
import type { Dir } from "./metrics";
import type { Window } from "../acculynx/windows";
import type { Scope, ScopeLevel } from "./types";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const countFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

// value/goal as a 0..1 fraction for a progress bar. `goal === null` means no target
// was ever set -- that must render as no bar at all, so it returns null rather than
// inferring or defaulting to zero (a missing target is not the same as a target of
// zero). `goal === 0` IS a real target (e.g. "sell nothing this period"): a value of
// 0 against it means the target is exactly met, so it reports 1 (full), and any
// positive value against a zero goal is already over target, also clamped to 1.
// Overachievement past 100% is intentionally clamped here -- the bar is a visual
// progress indicator, not the number itself, and a bar rendered past its own end
// would break the layout. The actual value (via fmtMoney/fmtCount) is what shows
// the true overachievement beside the bar.
export function barFill(value: number, goal: number | null): number | null {
  if (goal == null) return null;
  if (goal <= 0) return 1;
  const frac = value / goal;
  if (!Number.isFinite(frac)) return 1;
  return Math.max(0, Math.min(1, frac));
}

// Elapsed-period fraction, clamped to a safe 0..1 render range. The underlying pace
// math (which dates, which window) lives in ./periods (paceFraction); this is just
// the display-side safety clamp so a caller can hand it any number without it
// breaking a notch's position on the bar.
export function paceNotch(pace: number): number {
  return Math.max(0, Math.min(1, pace));
}

// Whole dollars, thousands separators: fmtMoney(28400) -> "$28,400".
export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return moneyFormatter.format(0);
  return moneyFormatter.format(n);
}

// Thousands separators, no currency: fmtCount(28400) -> "28,400".
export function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return countFormatter.format(0);
  return countFormatter.format(n);
}

// rate is a 0..1 fraction. One decimal below 10%, none at or above:
// fmtRate(0.029) -> "2.9%", fmtRate(0.33) -> "33%".
export function fmtRate(rate: number): string {
  const pct = Number.isFinite(rate) ? rate * 100 : 0;
  const decimals = Math.abs(pct) < 10 ? 1 : 0;
  return `${pct.toFixed(decimals)}%`;
}

// A conversion rate honoring the sample floor that ./metrics already decided via
// `hidden`. Below the floor this is "not enough data yet" -- never a fabricated
// "0%", which would claim a real measured result we do not actually have. At or
// above the floor, a genuine zero rate renders as a genuine zero.
export function fmtConversionRate(rate: number, hidden: boolean): string {
  if (hidden) return "not enough data yet";
  return fmtRate(rate);
}

// The comparison basis the label states must match what pages/api/scoreboard.ts
// actually computed: `previousSlice(w, ...)` (./periods.ts) shifts back exactly one
// window of whatever type is active, so a Week view's `pct`/`dir` genuinely compare
// to last week, a Day view to yesterday, and so on. Hardcoding "vs last month" for
// every window would be a specific, checkable, false claim on three of the four
// views. This map is the single place that phrase lives; keyed on the same `Window`
// union ./periods.ts and pages/api/scoreboard.ts already use, so there is no second
// definition of the four window names to drift out of sync.
const COMPARISON_LABEL: Record<Window, string> = {
  day: "vs yesterday",
  week: "vs last week",
  month: "vs last month",
  year: "vs last year",
};

// pct is percentage points (already *100, matching ./metrics.trend's output), dir
// is the direction that same call computed, and window says which comparison basis
// pct/dir were actually computed against (see COMPARISON_LABEL above). `dir === null`
// means there was no prior period to compare against -- that must render as no label
// at all (an arrow or a number would assert a direction we do not have), so this
// returns null rather than a flat or zeroed string. A `dir === "flat"` (pct exactly
// 0) is a real measured "no change" and does render, distinct from having no
// comparison at all.
export function trendLabel(pct: number | null, dir: Dir, window: Window): string | null {
  if (dir == null || pct == null) return null;
  const magnitude = Math.round(Math.abs(pct));
  return `${magnitude}% ${COMPARISON_LABEL[window]}`;
}

const absoluteDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

// The "last updated" note's copy. `syncedAt` is exactly what
// pages/api/scoreboard.ts's resolveSyncedAt() returns: the OLDEST successful sync
// among every source feeding the totals, or null when that freshness cannot be
// established (nothing has ever synced, or the lookup itself failed). Both null
// cases mean the same honest thing -- "we do not know" -- so this never guesses a
// time or silently omits the note (a missing note would read as "trust it blindly").
//
// `now` is a parameter, never `new Date()`: this module is pure (no I/O, no clock
// reads) so every branch is deterministic and testable without faking the system
// clock.
export function formatSyncedAt(syncedAt: string | null, now: Date): string {
  if (syncedAt === null) return "Sales data: last sync time unknown";

  const synced = new Date(syncedAt);
  const diffMs = now.getTime() - synced.getTime();

  // A non-positive gap (clock skew, or a timestamp somehow in the future) makes
  // "N minutes ago" nonsensical -- state the honest absolute date instead of a
  // negative or fabricated relative phrase.
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return `Sales data last synced ${absoluteDateFormatter.format(synced)}`;
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Sales data synced less than a minute ago";
  if (minutes < 60) return `Sales data synced ${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Sales data synced ${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Sales data synced ${days} day${days === 1 ? "" : "s"} ago`;

  // A week or older: a day count stops being useful information, so switch to the
  // calendar date rather than "37 days ago".
  return `Sales data last synced ${absoluteDateFormatter.format(synced)}`;
}

// The scope line's headcount label -- what geographic/org name the collective
// covers. This is deliberately a SEPARATE decision from the rank pool's "of N":
// the rank pool (RankStrip) counts current reps only, while this label sits next
// to a headcount that counts everyone whose production is in the total, including
// a rep who has since left. See scopeLine below for the full sentence.
//
// `scope.team` / `scope.branch` can genuinely be null (a leader whose app-account
// name never matched the org chart -- see resolve.ts). That must never render as
// the literal word "null" or an invented specific name; a truthful generic
// fallback keeps the line readable while staying honest about what is actually
// known.
export function scopeLabel(scope: Scope): string {
  switch (scope.level) {
    case "self":
      // A rep's scope line is never rendered (scopeLine returns null for "self");
      // this value is never displayed, but stays empty rather than a placeholder
      // string that could accidentally leak onto screen.
      return "";
    case "team":
      return scope.team || "Unassigned team";
    case "branch":
      return scope.branch || "Unassigned branch";
    case "company":
      return "Company-wide";
  }
}

// The full scope headcount line, e.g. "Dallas · 13 people contributed". `null`
// for a rep's own (self) scope -- that line is omitted entirely, not rendered
// with an empty label and a stray leading separator. `label` is expected to
// already be the honest, non-empty string scopeLabel() produces for every
// non-self level; if a caller somehow hands an empty label anyway, the dot
// separator is dropped rather than leading with "· N people contributed".
export function scopeLine(scope: { level: ScopeLevel; label: string; count: number }): string | null {
  if (scope.level === "self") return null;
  const who = scope.count === 1 ? "person" : "people";
  const countPart = `${fmtCount(scope.count)} ${who} contributed`;
  return scope.label ? `${scope.label} · ${countPart}` : countPart;
}

// The Revenue tile's "across N contracts" caption (spec §5: "$28,400 across 2
// contracts"). A real zero renders as "across 0 contracts", not a hidden or
// blank subtitle -- zero signed contracts this period is a genuine measured
// state, not the same as "we don't know".
export function contractsSubtitle(contracts: number): string {
  return `across ${fmtCount(contracts)} contract${contracts === 1 ? "" : "s"}`;
}
