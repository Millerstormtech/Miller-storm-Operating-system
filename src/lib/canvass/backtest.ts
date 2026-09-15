// src/lib/canvass/backtest.ts
// The backtest behind Checkpoint 2 (spec A6): would the map have pointed reps at
// the houses that went on to sign with us?
//
// Pure: no DB.

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
    openAccuLynxJob: false,
    neighborSignedAt: null,
  };
}

export type LiftCounts = { signedGood: number; signedTotal: number; randomGood: number; randomTotal: number };
export type Lift = { signedShare: number; randomShare: number; lift: number | null; passes: boolean };

/** Spec A6: signed houses must be at least twice as likely to be green or yellow as random houses nearby. */
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
