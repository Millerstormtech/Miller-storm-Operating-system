// src/lib/canvass/backtest.test.ts
import { describe, it, expect } from "vitest";
import { asOfFacts, liftSummary, pickRandom } from "./backtest";
import type { HomeFacts } from "./grade";

// Spec A6: grade each house signed in the last 12 months using only what we would
// have known 30 days before signing (hail up to then, age, owner; our own knocks
// left out, since they would give the answer away), and compare with random houses
// in the same ZIP codes. Pass: signed houses at least twice as likely to be green
// or yellow.

const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  yearBuilt: 1998,
  yearBuiltReliable: true,
  ownerLivesHere: true,
  hail: [
    { date: "2026-01-10", inches: 1.5 },
    { date: "2026-06-01", inches: 2.0 },
  ],
  knocks: [{ status: "Signed", at: "2026-05-01" }],
  openAccuLynxJob: true,
  neighborSignedAt: "2026-04-01",
  ...over,
});

describe("asOfFacts", () => {
  it("keeps only what we would have known on the day: earlier hail, age and owner", () => {
    expect(asOfFacts(facts(), "2026-03-01")).toEqual({
      yearBuilt: 1998,
      yearBuiltReliable: true,
      ownerLivesHere: true,
      hail: [{ date: "2026-01-10", inches: 1.5 }],
      knocks: [],
      openAccuLynxJob: false,
      neighborSignedAt: null,
    });
  });

  it("keeps a storm that fell on the day itself", () => {
    expect(asOfFacts(facts({ hail: [{ date: "2026-03-01", inches: 1.25 }] }), "2026-03-01").hail).toEqual([{ date: "2026-03-01", inches: 1.25 }]);
  });
});

describe("liftSummary", () => {
  it("compares how often signed houses were green or yellow with random houses nearby", () => {
    expect(liftSummary({ signedGood: 60, signedTotal: 100, randomGood: 200, randomTotal: 1000 })).toEqual({
      signedShare: 0.6,
      randomShare: 0.2,
      lift: 3,
      passes: true,
    });
  });

  it("does not pass below twice as likely", () => {
    expect(liftSummary({ signedGood: 30, signedTotal: 100, randomGood: 200, randomTotal: 1000 })).toMatchObject({ lift: 1.5, passes: false });
  });

  it("passes at exactly twice as likely", () => {
    expect(liftSummary({ signedGood: 40, signedTotal: 100, randomGood: 200, randomTotal: 1000 })).toMatchObject({ lift: 2, passes: true });
  });

  it("gives no lift when there are no random houses to compare with", () => {
    expect(liftSummary({ signedGood: 5, signedTotal: 10, randomGood: 0, randomTotal: 0 })).toEqual({
      signedShare: 0.5,
      randomShare: 0,
      lift: null,
      passes: false,
    });
  });
});

describe("pickRandom", () => {
  const houses = Array.from({ length: 50 }, (_, i) => `house-${i}`);

  it("picks the same houses every time for the same seed, so the backtest can be repeated", () => {
    expect(pickRandom(houses, 5, 42)).toEqual(pickRandom(houses, 5, 42));
  });

  it("picks different houses for a different seed", () => {
    expect(pickRandom(houses, 5, 42)).not.toEqual(pickRandom(houses, 5, 7));
  });

  it("never picks the same house twice, nor more houses than exist", () => {
    const picked = pickRandom(houses.slice(0, 3), 10, 42);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });
});
