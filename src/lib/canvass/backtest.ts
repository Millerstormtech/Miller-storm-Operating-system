// src/lib/canvass/backtest.ts
// The backtest behind Checkpoint 2 (spec A6): would the map have pointed reps at
// the houses that went on to sign with us?
//
// Pure: no DB.

import type { GradeConfig } from "./config";
import type { HomeFacts } from "./grade";

/**
 * A house's facts as they stood on `asOf`: hail up to that day, age and owner.
 * Our own knocks, AccuLynx jobs and the neighbour bonus are left out, since they
 * would give the answer away.
 */
export function asOfFacts(facts: HomeFacts, asOf: string): HomeFacts {
  return {
    ...facts,
    hail: facts.hail.filter((storm) => storm.date <= asOf),
    knocks: [],
    blockingJobStage: null,
    neighborSignedAt: null,
  };
}

import type { Color } from "./grade";

/**
 * Which colour counts as "the map pointed a rep here".
 *
 * GREEN ONLY, decided by Youssef on 17 Sep 2026 (Checkpoint 2, option A).
 * Measured on 787 signed houses against 7,870 random ones: green was 1.94x
 * more common among signed houses, yellow was 1.01x, the same as a random
 * house. So yellow is told to reps as "worth a look", not as a promise, and
 * the backtest judges the promise. The old reading (green or yellow) is still
 * printed for information so the two can be compared.
 *
 * Option B (retune so yellow means something) was APPLIED on 5 Oct 2026 with
 * Youssef's approval: see GRADE in config.ts and `--retune` in the backtest
 * script. Green stays the promise.
 */
export function isGoodDoor(color: Color): boolean {
  return color === "green";
}

/** The reading before 17 Sep 2026, kept for comparison only. */
export function isGoodOrMaybeDoor(color: Color): boolean {
  return color === "green" || color === "yellow";
}

export type LiftCounts = { signedGood: number; signedTotal: number; randomGood: number; randomTotal: number };
export type Lift = { signedShare: number; randomShare: number; lift: number | null; passes: boolean };

/** Spec A6: signed houses must be at least twice as likely to be a good door (isGoodDoor) as random houses nearby. */
export const PASS_LIFT = 2;

export function liftSummary(counts: LiftCounts): Lift {
  const signed = counts.signedTotal > 0 ? counts.signedGood / counts.signedTotal : 0;
  const random = counts.randomTotal > 0 ? counts.randomGood / counts.randomTotal : 0;
  const lift = random > 0 ? Math.round((signed / random) * 100) / 100 : null;
  return {
    signedShare: Math.round(signed * 10000) / 10000,
    randomShare: Math.round(random * 10000) / 10000,
    lift,
    passes: lift !== null && lift >= PASS_LIFT,
  };
}

/** A small seeded random number generator (mulberry32): the same seed always gives the same sequence. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Up to `count` different items, chosen at random but always the same for the same seed. */
export function pickRandom<T>(items: readonly T[], count: number, seed: number): T[] {
  const pool = [...items];
  const random = seeded(seed);
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool[index]);
    pool[index] = pool[pool.length - 1];
    pool.pop();
  }
  return picked;
}

// ---- Option B: retuning so yellow means something (Youssef, 5 Oct 2026: work the parked items) ----
// Method fixed on 17 Sep: tune on the OLDER half of signings, confirm on the NEWER half,
// then propose. Nothing here changes the live grade; GRADE in config.ts does that.

/** Per colour, how many signed and random houses got it. */
export type ColorCounts = Record<Color, { signed: number; random: number }> & { signedTotal: number; randomTotal: number };

export const emptyColorCounts = (): ColorCounts => ({
  green: { signed: 0, random: 0 },
  yellow: { signed: 0, random: 0 },
  orange: { signed: 0, random: 0 },
  red: { signed: 0, random: 0 },
  signedTotal: 0,
  randomTotal: 0,
});

export function countColor(counts: ColorCounts, color: Color, signed: boolean): void {
  if (signed) {
    counts.signedTotal++;
    counts[color].signed++;
  } else {
    counts.randomTotal++;
    counts[color].random++;
  }
}

/** How many times more common a set of colours is among signed houses than random ones. */
export function colorLift(counts: ColorCounts, colors: readonly Color[]): Lift {
  const sum = (side: "signed" | "random") => colors.reduce((total, color) => total + counts[color][side], 0);
  return liftSummary({ signedGood: sum("signed"), signedTotal: counts.signedTotal, randomGood: sum("random"), randomTotal: counts.randomTotal });
}

export type Variant = { name: string; config: GradeConfig };

/**
 * The settings tried: hail points by size band, house-age points, owner points
 * and colour cut-offs. 288 combinations, today's settings among them. Only
 * points and cut-offs move; which facts count stays the same.
 */
export function retuneVariants(base: GradeConfig): Variant[] {
  const hails: Array<[string, number[]]> = [
    ["hail 40/30/20", [40, 30, 20]],
    ["hail 40/30/0", [40, 30, 0]],
    ["hail 50/35/0", [50, 35, 0]],
    ["hail 45/35/10", [45, 35, 10]],
  ];
  const ages: Array<[string, [number, number, number]]> = [
    ["age 20/10/10", [20, 10, 10]],
    ["age 20/10/0", [20, 10, 0]],
    ["age 10/5/0", [10, 5, 0]],
    ["age 0/0/0", [0, 0, 0]],
  ];
  const owners: Array<[string, [number, number]]> = [
    ["owner +10/-5", [10, -5]],
    ["owner +15/-10", [15, -10]],
    ["owner +20/-15", [20, -15]],
  ];
  const cutoffs: Array<[string, GradeConfig["colors"]]> = [
    ["colours 60/40/20", { green: 60, yellow: 40, orange: 20 }],
    ["colours 60/45/25", { green: 60, yellow: 45, orange: 25 }],
    ["colours 60/50/30", { green: 60, yellow: 50, orange: 30 }],
    ["colours 65/45/25", { green: 65, yellow: 45, orange: 25 }],
    ["colours 70/50/30", { green: 70, yellow: 50, orange: 30 }],
    ["colours 55/40/20", { green: 55, yellow: 40, orange: 20 }],
  ];
  const variants: Variant[] = [];
  for (const [hailName, points] of hails)
    for (const [ageName, [oldPoints, midPoints, unknownPoints]] of ages)
      for (const [ownerName, [livesHerePoints, livesElsewherePoints]] of owners)
        for (const [colorName, colors] of cutoffs) {
          variants.push({
            name: `${hailName}, ${ageName}, ${ownerName}, ${colorName}`,
            config: {
              ...base,
              hailBands: base.hailBands.map((band, i) => ({ ...band, points: points[i] ?? band.points })),
              age: { ...base.age, oldPoints, midPoints, unknownPoints },
              owner: { livesHerePoints, livesElsewherePoints },
              colors,
            },
          });
        }
  return variants;
}

export type RetuneScore = { green: Lift; yellow: Lift; greenOrYellow: Lift };

export function retuneScore(counts: ColorCounts): RetuneScore {
  return { green: colorLift(counts, ["green"]), yellow: colorLift(counts, ["yellow"]), greenOrYellow: colorLift(counts, ["green", "yellow"]) };
}

/**
 * The bar a retuned grade must clear on the older half before it is even
 * looked at: green must not get worse at its job (lift at least today's) or
 * much rarer (at least half of today's share of random houses), and yellow
 * must be a real group (at least 10% of random houses).
 */
export function qualifies(candidate: RetuneScore, today: RetuneScore): boolean {
  return (
    (candidate.green.lift ?? 0) >= (today.green.lift ?? 0) &&
    candidate.green.randomShare >= today.green.randomShare / 2 &&
    candidate.yellow.randomShare >= 0.1
  );
}

/** Qualifying settings, highest yellow lift first: that is what "yellow means something" asks. */
export function rankRetunes<T extends { score: RetuneScore }>(candidates: readonly T[], today: RetuneScore): T[] {
  return candidates.filter((c) => qualifies(c.score, today)).sort((a, b) => (b.score.yellow.lift ?? 0) - (a.score.yellow.lift ?? 0));
}
