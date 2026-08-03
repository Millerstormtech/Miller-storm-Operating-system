import type { Totals } from "./types";

export type Dir = "up" | "down" | "flat" | null;
export interface Conversion { rate: number; hidden: boolean }

const DEFAULT_MIN_KNOCKS = 10;
const DEFAULT_MIN_CLAIMS = 3;

export function conversions(
  t: Totals,
  opts: { minKnocks?: number; minClaims?: number } = {}
): { knockToClaim: Conversion; claimToContract: Conversion } {
  const minKnocks = opts.minKnocks ?? DEFAULT_MIN_KNOCKS;
  const minClaims = opts.minClaims ?? DEFAULT_MIN_CLAIMS;
  return {
    knockToClaim: {
      rate: t.knocks > 0 ? t.claims / t.knocks : 0,
      hidden: t.knocks < minKnocks,
    },
    claimToContract: {
      rate: t.claims > 0 ? t.contracts / t.claims : 0,
      hidden: t.claims < minClaims,
    },
  };
}

export function trend(current: number, previous: number): { pct: number | null; dir: Dir } {
  if (previous <= 0) return { pct: null, dir: null };
  const pct = ((current - previous) / previous) * 100;
  const dir: Dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return { pct, dir };
}

export function rateDir(current: number, previous: number, hidden: boolean): Dir {
  if (hidden || previous <= 0) return null;
  return current > previous ? "up" : current < previous ? "down" : "flat";
}
