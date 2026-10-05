// src/lib/canvass/backtest.test.ts
import { describe, it, expect } from "vitest";
import {
  asOfFacts,
  colorLift,
  countColor,
  emptyColorCounts,
  isGoodDoor,
  isGoodOrMaybeDoor,
  liftSummary,
  pickRandom,
  rankRetunes,
  retuneVariants,
} from "./backtest";
import { GRADE } from "./config";
import type { HomeFacts } from "./grade";

// Spec A6: grade each house signed in the last 12 months using only what we would
// have known 30 days before signing (hail up to then, age, owner; our own knocks
// left out, since they would give the answer away), and compare with random houses
// in the same ZIP codes. Pass: signed houses at least twice as likely to be a
// GOOD door. Since 17 Sep 2026 (Youssef, Checkpoint 2 option A) that means green
// only: measured, yellow houses signed at the same rate as random ones.

const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  yearBuilt: 1998,
  yearBuiltReliable: true,
  ownerLivesHere: true,
  hail: [
    { date: "2026-01-10", inches: 1.5 },
    { date: "2026-06-01", inches: 2.0 },
  ],
  knocks: [{ status: "Signed", at: "2026-05-01" }],
  blockingJobStage: "Approved",
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
      blockingJobStage: null,
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

describe("isGoodDoor", () => {
  // Youssef, 17 Sep 2026: the map's promise is green. Yellow is "worth a look".
  it("counts green only", () => {
    expect(isGoodDoor("green")).toBe(true);
    expect(isGoodDoor("yellow")).toBe(false);
    expect(isGoodDoor("orange")).toBe(false);
    expect(isGoodDoor("red")).toBe(false);
  });

  it("keeps the old green-or-yellow reading available for comparison, never for the verdict", () => {
    expect(isGoodOrMaybeDoor("green")).toBe(true);
    expect(isGoodOrMaybeDoor("yellow")).toBe(true);
    expect(isGoodOrMaybeDoor("orange")).toBe(false);
    expect(isGoodOrMaybeDoor("red")).toBe(false);
  });

  it("the bar itself did not move: it is still twice as likely", () => {
    // 46.0% of signed houses green vs 23.7% of random ones, the 16 Sep 2026 measurement.
    const measured = liftSummary({ signedGood: 362, signedTotal: 787, randomGood: 1865, randomTotal: 7870 });
    expect(measured.lift).toBe(1.94);
    expect(measured.passes).toBe(false); // a hair under, and it is reported that way
    expect(liftSummary({ signedGood: 400, signedTotal: 787, randomGood: 1865, randomTotal: 7870 }).passes).toBe(true);
  });
});

describe("option B retune helpers", () => {
  const counts = () => {
    const c = emptyColorCounts();
    // 10 signed: 4 green, 3 yellow, 2 orange, 1 red. 100 random: 10 green, 15 yellow, 40 orange, 35 red.
    const signed = [["green", 4], ["yellow", 3], ["orange", 2], ["red", 1]] as const;
    const random = [["green", 10], ["yellow", 15], ["orange", 40], ["red", 35]] as const;
    for (const [color, n] of signed) for (let i = 0; i < n; i++) countColor(c, color, true);
    for (const [color, n] of random) for (let i = 0; i < n; i++) countColor(c, color, false);
    return c;
  };

  it("counts each colour on each side and works out lifts", () => {
    const c = counts();
    expect(c.signedTotal).toBe(10);
    expect(c.randomTotal).toBe(100);
    expect(colorLift(c, ["green"]).lift).toBe(4);
    expect(colorLift(c, ["yellow"]).lift).toBe(2);
    expect(colorLift(c, ["green", "yellow"]).lift).toBe(2.8);
  });

  it("tries 288 settings, today's among them, changing only points and cut-offs", () => {
    const variants = retuneVariants(GRADE);
    expect(variants).toHaveLength(288);
    expect(new Set(variants.map((v) => v.name)).size).toBe(288);
    const today = variants.find((v) => v.name === "hail 40/30/20, age 20/10/10, owner +10/-5, colours 60/40/20");
    expect(today?.config).toEqual(GRADE);
    for (const v of variants) {
      expect(v.config.hailLookbackMonths).toBe(GRADE.hailLookbackMonths);
      expect(v.config.hailBands.map((b) => b.minInches)).toEqual(GRADE.hailBands.map((b) => b.minInches));
      expect(v.config.closedJobBlocksYears).toBe(GRADE.closedJobBlocksYears);
    }
  });

  it("ranks only settings where green stays as good and not too rare and yellow is a real group, best yellow lift first", () => {
    const lift = (value: number, randomShare: number) => ({ lift: value, randomShare, signedShare: 0, passes: false });
    const score = (green: number, greenRandom: number, yellow: number, yellowRandom: number) => ({
      green: lift(green, greenRandom),
      yellow: lift(yellow, yellowRandom),
      greenOrYellow: lift(0, 0),
    });
    const today = score(1.9, 0.2, 1.0, 0.2);
    const ranked = rankRetunes(
      [
        { name: "worse green", score: score(1.8, 0.2, 1.6, 0.2) },
        { name: "green too rare", score: score(2.5, 0.09, 1.6, 0.2) },
        { name: "yellow too small", score: score(2.0, 0.2, 1.9, 0.05) },
        { name: "good", score: score(1.95, 0.15, 1.4, 0.2) },
        { name: "better", score: score(1.9, 0.12, 1.5, 0.25) },
      ],
      today
    );
    expect(ranked.map((r) => r.name)).toEqual(["better", "good"]);
  });
});
