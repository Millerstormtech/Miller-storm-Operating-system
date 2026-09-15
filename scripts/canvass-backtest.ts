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
//   --uri <mongodb>            database, default mongodb://127.0.0.1:27017/millerstorm
//
// Prints counts and shares only.

import mongoose from "mongoose";
import { GRADE } from "../src/lib/canvass/config";
import { gradeHome } from "../src/lib/canvass/grade";
import { homeFacts } from "../src/lib/canvass/facts";
import { asOfFacts, liftSummary, pickRandom } from "../src/lib/canvass/backtest";
import { centralDay, monthsBefore } from "../src/lib/canvass/dates";
import { areaForCounty } from "../src/lib/canvass/counties";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassJobModel } from "../src/lib/models/CanvassJob";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

const DAYS_BEFORE_SIGNING = 30;
const SIGNED_WITHIN_MONTHS = 12;
const HAIL_WINDOWS = [12, 18, 24];

type Options = { today: string; randomPerSigned: number; seed: number; uri: string };

function parseArgs(argv: string[]): Options {
  const options: Options = { today: centralDay(new Date()) ?? "", randomPerSigned: 10, seed: 42, uri: "mongodb://127.0.0.1:27017/millerstorm" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--today") options.today = argv[++i] ?? "";
    else if (arg === "--random-per-signed") options.randomPerSigned = Number(argv[++i]);
    else if (arg === "--seed") options.seed = Number(argv[++i]);
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.today)) throw new Error("--today must be YYYY-MM-DD");
  if (!Number.isInteger(options.randomPerSigned) || options.randomPerSigned < 1) throw new Error("--random-per-signed must be 1 or more");
  return options;
}

const dayBefore = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

type HouseDoc = {
  _id: unknown;
  fips: string;
  address?: { zip?: string };
  yearBuilt?: number | null;
  ownerLivesHere?: boolean | null;
  hail?: Array<{ date: string; inches: number }>;
};

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

  const isGood = (house: HouseDoc, asOf: string, months: number) => {
    const facts = homeFacts({
      yearBuilt: house.yearBuilt ?? null,
      ownerLivesHere: house.ownerLivesHere ?? null,
      hail: house.hail ?? [],
      countyFlags: flagsByFips.get(house.fips) ?? [],
      doors: [],
      jobs: [],
      neighborSignedAt: null,
    });
    const color = gradeHome(asOfFacts(facts, asOf), asOf, { ...GRADE, hailLookbackMonths: months }).color;
    return color === "green" || color === "yellow";
  };

  for (const months of HAIL_WINDOWS) {
    const byArea = new Map<string, { signedGood: number; signedTotal: number; randomGood: number; randomTotal: number }>();
    const counts = { signedGood: 0, signedTotal: 0, randomGood: 0, randomTotal: 0 };
    for (const pair of pairs) {
      const area = areaForCounty(pair.house.fips) ?? "other";
      const areaCounts = byArea.get(area) ?? { signedGood: 0, signedTotal: 0, randomGood: 0, randomTotal: 0 };
      const signedGood = isGood(pair.house, pair.asOf, months) ? 1 : 0;
      counts.signedTotal++;
      counts.signedGood += signedGood;
      areaCounts.signedTotal++;
      areaCounts.signedGood += signedGood;
      for (const id of pair.random) {
        const house = randomHouses.get(id);
        if (!house) continue;
        const good = isGood(house, pair.asOf, months) ? 1 : 0;
        counts.randomTotal++;
        counts.randomGood += good;
        areaCounts.randomTotal++;
        areaCounts.randomGood += good;
      }
      byArea.set(area, areaCounts);
    }
    const overall = liftSummary(counts);
    const label = months === GRADE.hailLookbackMonths ? "DECIDING RESULT" : "for information";
    console.log(
      `[backtest] hail window ${months} months (${label}): signed houses green or yellow ${(overall.signedShare * 100).toFixed(1)}% of ${counts.signedTotal}; ` +
        `random houses ${(overall.randomShare * 100).toFixed(1)}% of ${counts.randomTotal}; lift ${overall.lift ?? "n/a"}; ${overall.passes ? "PASSES" : "does not pass"} the 2x bar`
    );
    for (const [area, areaCounts] of byArea) {
      const lift = liftSummary(areaCounts);
      console.log(`[backtest]   ${area}: signed ${areaCounts.signedTotal}, signed good ${(lift.signedShare * 100).toFixed(1)}%, random good ${(lift.randomShare * 100).toFixed(1)}%, lift ${lift.lift ?? "n/a"}`);
    }
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[backtest] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
