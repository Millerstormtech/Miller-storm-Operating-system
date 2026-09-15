// scripts/canvass-backtest.ts
// The Checkpoint 2 backtest (plan T5.2, spec A6). Read-only, apart from creating
// the ZIP index its random sample needs.
//
// For every AccuLynx job signed in the last 12 months and matched to a house, the
// house is graded as of 30 days before signing, using only what we would have known
// then (hail up to that day, age, owner). Random houses in the same ZIP code (the
// same county when the ZIP is blank) are graded as of the same day. Pass: signed
// houses at least twice as likely to be green or yellow. The grade's hail window
// is 12 months; 18 and 24 months are reported for information only.
//
//   npx vite-node scripts/canvass-backtest.ts
//
// Options:
//   --today <YYYY-MM-DD>       default today in Texas
//   --random-per-signed <n>    random houses per signed house, default 10
//   --seed <n>                 random seed, default 42 (the same seed gives the same sample)
//   --explain                  also compare signed and random houses by hail, age and owner,
//                              and try a few alternative grade settings (for a proposal only;
//                              changing the grade needs Youssef's approval)
//   --uri <mongodb>            database, default mongodb://127.0.0.1:27017/millerstorm
//
// Prints counts and shares only.

import mongoose from "mongoose";
import { GRADE, type GradeConfig } from "../src/lib/canvass/config";
import { gradeHome, type HomeFacts } from "../src/lib/canvass/grade";
import { homeFacts } from "../src/lib/canvass/facts";
import { biggestHailInWindow } from "../src/lib/canvass/hail";
import { asOfFacts, liftSummary, pickRandom } from "../src/lib/canvass/backtest";
import { centralDay, monthsBefore } from "../src/lib/canvass/dates";
import { areaForCounty } from "../src/lib/canvass/counties";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassJobModel } from "../src/lib/models/CanvassJob";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

const DAYS_BEFORE_SIGNING = 30;
const SIGNED_WITHIN_MONTHS = 12;
const HAIL_WINDOWS = [12, 18, 24];

type Options = { today: string; randomPerSigned: number; seed: number; explain: boolean; uri: string };

function parseArgs(argv: string[]): Options {
  const options: Options = { today: centralDay(new Date()) ?? "", randomPerSigned: 10, seed: 42, explain: false, uri: "mongodb://127.0.0.1:27017/millerstorm" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--today") options.today = argv[++i] ?? "";
    else if (arg === "--random-per-signed") options.randomPerSigned = Number(argv[++i]);
    else if (arg === "--seed") options.seed = Number(argv[++i]);
    else if (arg === "--explain") options.explain = true;
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.today)) throw new Error("--today must be YYYY-MM-DD");
  if (!Number.isInteger(options.randomPerSigned) || options.randomPerSigned < 1) throw new Error("--random-per-signed must be 1 or more");
  return options;
}

const dayBefore = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

type HouseDoc = {
  _id: unknown;
  fips: string;
  address?: { zip?: string };
  yearBuilt?: number | null;
  ownerLivesHere?: boolean | null;
  hail?: Array<{ date: string; inches: number }>;
};

type Counts = { signedGood: number; signedTotal: number; randomGood: number; randomTotal: number };
const emptyCounts = (): Counts => ({ signedGood: 0, signedTotal: 0, randomGood: 0, randomTotal: 0 });

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mongoose.connect(options.uri);
  // The only write: the ZIP index that keeps the same-ZIP random sample from scanning every house per ZIP.
  await CanvassHomeModel.createIndexes();

  const flagsByFips = new Map<string, string[]>();
  for (const row of (await CanvassCountyQualityModel.find({ source: "txgio-2025" }, { fips: 1, flags: 1 }).lean()) as Array<{ fips: string; flags?: string[] }>) {
    flagsByFips.set(row.fips, row.flags ?? []);
  }

  const signedFrom = new Date(`${monthsBefore(options.today, SIGNED_WITHIN_MONTHS)}T00:00:00Z`);
  const jobs = (await CanvassJobModel.find({ homeId: { $ne: null }, signedAt: { $gte: signedFrom } }, { homeId: 1, signedAt: 1 }).lean()) as Array<{
    homeId: unknown;
    signedAt: Date;
  }>;
  const signedByHome = new Map<string, string>();
  for (const job of jobs) {
    const day = centralDay(job.signedAt);
    if (!day) continue;
    const homeId = String(job.homeId);
    const earlier = signedByHome.get(homeId);
    if (!earlier || day < earlier) signedByHome.set(homeId, day);
  }

  const projection = { fips: 1, "address.zip": 1, yearBuilt: 1, ownerLivesHere: 1, hail: 1 };
  const signedHouses = (await CanvassHomeModel.find({ _id: { $in: [...signedByHome.keys()] } }, projection).lean()) as HouseDoc[];
  console.log(`[backtest] ${jobs.length} matched jobs signed since ${signedFrom.toISOString().slice(0, 10)}; ${signedHouses.length} distinct houses`);

  // Candidate random houses: every house in each signed house's ZIP (or county when the ZIP is blank).
  const groupOf = (house: HouseDoc) => (house.address?.zip ? `zip:${house.address.zip}` : `county:${house.fips}`);
  const candidatesByGroup = new Map<string, string[]>();
  for (const group of new Set(signedHouses.map(groupOf))) {
    const filter = group.startsWith("zip:") ? { "address.zip": group.slice(4) } : { fips: group.slice(7) };
    const ids = ((await CanvassHomeModel.find(filter, { _id: 1 }).lean()) as Array<{ _id: unknown }>).map((h) => String(h._id)).filter((id) => !signedByHome.has(id));
    candidatesByGroup.set(group, ids);
  }

  const pairs: Array<{ house: HouseDoc; asOf: string; random: string[] }> = signedHouses.map((house, index) => {
    const asOf = dayBefore(signedByHome.get(String(house._id))!, DAYS_BEFORE_SIGNING);
    return { house, asOf, random: pickRandom(candidatesByGroup.get(groupOf(house)) ?? [], options.randomPerSigned, options.seed + index) };
  });
  const randomIds = [...new Set(pairs.flatMap((pair) => pair.random))];
  const randomHouses = new Map<string, HouseDoc>();
  for (let i = 0; i < randomIds.length; i += 5000) {
    for (const house of (await CanvassHomeModel.find({ _id: { $in: randomIds.slice(i, i + 5000) } }, projection).lean()) as HouseDoc[]) {
      randomHouses.set(String(house._id), house);
    }
  }

  const factsAsOf = (house: HouseDoc, asOf: string): HomeFacts =>
    asOfFacts(
      homeFacts({
        yearBuilt: house.yearBuilt ?? null,
        ownerLivesHere: house.ownerLivesHere ?? null,
        hail: house.hail ?? [],
        countyFlags: flagsByFips.get(house.fips) ?? [],
        doors: [],
        jobs: [],
        neighborSignedAt: null,
      }),
      asOf
    );

  /** Every graded pair in the sample: the signed house, then its random houses. */
  function* graded(config: GradeConfig) {
    for (const pair of pairs) {
      const area = areaForCounty(pair.house.fips) ?? "other";
      yield { signed: true, area, asOf: pair.asOf, house: pair.house, grade: gradeHome(factsAsOf(pair.house, pair.asOf), pair.asOf, config) };
      for (const id of pair.random) {
        const house = randomHouses.get(id);
        if (house) yield { signed: false, area, asOf: pair.asOf, house, grade: gradeHome(factsAsOf(house, pair.asOf), pair.asOf, config) };
      }
    }
  }

  const add = (counts: Counts, signed: boolean, good: boolean) => {
    if (signed) {
      counts.signedTotal++;
      if (good) counts.signedGood++;
    } else {
      counts.randomTotal++;
      if (good) counts.randomGood++;
    }
  };

  for (const months of HAIL_WINDOWS) {
    const counts = emptyCounts();
    const byArea = new Map<string, Counts>();
    for (const row of graded({ ...GRADE, hailLookbackMonths: months })) {
      const good = row.grade.color === "green" || row.grade.color === "yellow";
      add(counts, row.signed, good);
      const areaCounts = byArea.get(row.area) ?? emptyCounts();
      add(areaCounts, row.signed, good);
      byArea.set(row.area, areaCounts);
    }
    const overall = liftSummary(counts);
    const label = months === GRADE.hailLookbackMonths ? "DECIDING RESULT" : "for information";
    console.log(
      `[backtest] hail window ${months} months (${label}): signed houses green or yellow ${pct(overall.signedShare)} of ${counts.signedTotal}; ` +
        `random houses ${pct(overall.randomShare)} of ${counts.randomTotal}; lift ${overall.lift ?? "n/a"}; ${overall.passes ? "PASSES" : "does not pass"} the 2x bar`
    );
    for (const [area, areaCounts] of byArea) {
      const lift = liftSummary(areaCounts);
      console.log(`[backtest]   ${area}: signed ${areaCounts.signedTotal}, signed good ${pct(lift.signedShare)}, random good ${pct(lift.randomShare)}, lift ${lift.lift ?? "n/a"}`);
    }
  }

  if (options.explain) {
    // How signed and random houses differ on each fact, under today's settings.
    const factors = new Map<string, { signed: number; random: number }>();
    let signedTotal = 0;
    let randomTotal = 0;
    const note = (factor: string, signed: boolean) => {
      const entry = factors.get(factor) ?? { signed: 0, random: 0 };
      if (signed) entry.signed++;
      else entry.random++;
      factors.set(factor, entry);
    };
    for (const row of graded(GRADE)) {
      if (row.signed) signedTotal++;
      else randomTotal++;
      const facts = factsAsOf(row.house, row.asOf);
      const storm = biggestHailInWindow(facts.hail, row.asOf, GRADE.hailLookbackMonths);
      note(`hail ${!storm ? "none of 1 in+" : storm.inches >= 1.75 ? "1.75 in+" : storm.inches >= 1.25 ? "1.25 to 1.5 in" : "1 in"}`, row.signed);
      const year = Number(row.asOf.slice(0, 4));
      const age = facts.yearBuiltReliable && facts.yearBuilt !== null ? year - facts.yearBuilt : null;
      note(`age ${age === null ? "unknown" : age >= 20 ? "20+ years" : age >= 12 ? "12 to 19 years" : "under 12 years"}`, row.signed);
      note(`owner ${facts.ownerLivesHere === true ? "lives here" : facts.ownerLivesHere === false ? "lives elsewhere" : "unknown"}`, row.signed);
      note(`color ${row.grade.color}`, row.signed);
    }
    console.log(`[explain] share of signed houses (${signedTotal}) and random houses (${randomTotal}) with each fact, and how many times more common it is among signed houses:`);
    for (const [factor, entry] of [...factors.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const signedShare = entry.signed / Math.max(1, signedTotal);
      const randomShare = entry.random / Math.max(1, randomTotal);
      const ratio = randomShare > 0 ? (signedShare / randomShare).toFixed(2) : "n/a";
      console.log(`[explain]   ${factor}: signed ${pct(signedShare)}, random ${pct(randomShare)}, ${ratio}x`);
    }

    // Alternative settings, for a proposal only.
    const variants: Array<[string, GradeConfig]> = [
      ["today's settings", GRADE],
      ["no 1 in hail band (hail counts from 1.25 in)", { ...GRADE, hailBands: GRADE.hailBands.filter((band) => band.minInches > 1) }],
      ["unknown age scores 0 instead of 10", { ...GRADE, age: { ...GRADE.age, unknownPoints: 0 } }],
      ["stricter colors (green 70, yellow 50, orange 30)", { ...GRADE, colors: { green: 70, yellow: 50, orange: 30 } }],
      [
        "all three together",
        { ...GRADE, hailBands: GRADE.hailBands.filter((band) => band.minInches > 1), age: { ...GRADE.age, unknownPoints: 0 }, colors: { green: 70, yellow: 50, orange: 30 } },
      ],
    ];
    for (const [name, config] of variants) {
      const goodCounts = emptyCounts();
      const greenCounts = emptyCounts();
      for (const row of graded(config)) {
        add(goodCounts, row.signed, row.grade.color === "green" || row.grade.color === "yellow");
        add(greenCounts, row.signed, row.grade.color === "green");
      }
      const good = liftSummary(goodCounts);
      const green = liftSummary(greenCounts);
      console.log(
        `[explain] ${name}: green or yellow signed ${pct(good.signedShare)} vs random ${pct(good.randomShare)} (lift ${good.lift ?? "n/a"}); ` +
          `green only signed ${pct(green.signedShare)} vs random ${pct(green.randomShare)} (lift ${green.lift ?? "n/a"})`
      );
    }
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[backtest] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
