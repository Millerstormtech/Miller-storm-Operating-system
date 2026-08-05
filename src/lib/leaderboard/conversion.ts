// src/lib/leaderboard/conversion.ts
// Pure, import-free. Turns two funnel-stage counts into a display-ready
// conversion rate.
//
// Named generically (from -> to) rather than after leads/claims on purpose: the
// board is a funnel, so a second arrow between any other adjacent pair reuses
// this function unchanged.
//
// The board component and the PDF export BOTH import this, which is the point.
// A printed board that disagreed with the screen it came from is the failure
// this module exists to make impossible.

/**
 * Below this many in the FROM stage, the rate is rendered greyed out by the
 * caller. A rep with 1 lead and 1 claim reads as a confident 100% otherwise.
 * Greying is cosmetic only: the number is still printed and still sorts.
 */
export const LOW_SAMPLE_THRESHOLD = 3;

/** Shown when there is no rate. Matches the glyph the board already uses for an empty Branch or Team. */
export const EMPTY_RATE = "—";

export interface ConversionRate {
  /** to / from, or null when the denominator is unusable. Never NaN, never Infinity. */
  value: number | null;
  /** True when the denominator is below LOW_SAMPLE_THRESHOLD. */
  lowSample: boolean;
}

export function conversionRate(from: number, to: number): ConversionRate {
  const f = Number(from);
  const t = Number(to);
  // f <= 0 covers both "no activity yet" and the divide-by-zero case. A negative
  // numerator cannot happen from the aggregation but is rejected rather than
  // printed as a negative percentage.
  if (!Number.isFinite(f) || !Number.isFinite(t) || f <= 0 || t < 0) {
    return { value: null, lowSample: true };
  }
  return { value: t / f, lowSample: f < LOW_SAMPLE_THRESHOLD };
}

/**
 * One decimal place, always. NOT capped at 100%: over a short date range a rep
 * can file more claims than they created leads, because the claims belong to
 * leads created before the range began. That reads as e.g. 140%, which is the
 * clearest possible signal that the range is too short to draw conclusions from.
 */
export function formatRate(r: ConversionRate): string {
  if (r.value === null) return EMPTY_RATE;
  return `${(r.value * 100).toFixed(1)}%`;
}
