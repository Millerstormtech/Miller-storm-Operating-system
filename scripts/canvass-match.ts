// scripts/canvass-match.ts
// Attaches every RepCard door and AccuLynx job that has a map position to the house
// it belongs to (plan T4.3), with the one match rule in src/lib/canvass/match.ts.
//
//   npx vite-node scripts/canvass-match.ts
//
// Options:
//   --only doors|jobs   match one kind only, default both
//   --uri <mongodb>     database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote      required to write to anything but the local test database
//   --dry-run           count only, write nothing
//
// Re-runnable: every run recomputes every match, so run it after any house
// re-import. Per county, matched and nearby-unmatched counts go on the county's
// quality row. Prints counts only, never addresses.

import mongoose from "mongoose";
import { MATCH, matchToHome, nearestWithin } from "../src/lib/canvass/match";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassDoorModel } from "../src/lib/models/CanvassDoor";
import { CanvassJobModel } from "../src/lib/models/CanvassJob";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

const EARTH_RADIUS_METERS = 6378137; // $centerSphere takes a radius in radians
const NEARBY_METERS = 2000; // an unmatched door this close to a loaded house counts against that house's county
const BATCH_SIZE = 2000;
const QUALITY_SOURCE = "txgio-2025";

type Kind = "doors" | "jobs";
type Options = { only: Kind | null; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { only: null, uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--only") {
      const value = argv[++i];
      if (value !== "doors" && value !== "jobs") throw new Error("--only takes doors or jobs");
      options.only = value;
    } else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

type Candidate = { id: string; lat: number; lng: number; addressLine: string; fips: string };

async function housesWithin(lon: number, lat: number, meters: number): Promise<Candidate[]> {
  const homes = (await CanvassHomeModel.find(
    { location: { $geoWithin: { $centerSphere: [[lon, lat], meters / EARTH_RADIUS_METERS] } } },
    { location: 1, "address.line": 1, fips: 1 }
  ).lean()) as Array<{ _id: unknown; location: { coordinates: [number, number] }; address?: { line?: string }; fips: string }>;
  return homes.map((home) => ({
    id: String(home._id),
    lat: home.location.coordinates[1],
    lng: home.location.coordinates[0],
    addressLine: home.address?.line ?? "",
    fips: home.fips,
  }));
}

async function countyNearby(lon: number, lat: number): Promise<string | null> {
  const home = (await CanvassHomeModel.findOne(
    { location: { $near: { $geometry: { type: "Point", coordinates: [lon, lat] }, $maxDistance: NEARBY_METERS } } },
    { fips: 1 }
  ).lean()) as { fips: string } | null;
  return home?.fips ?? null;
}

async function matchKind(kind: Kind, options: Options) {
  const Model = kind === "doors" ? CanvassDoorModel : CanvassJobModel;
  const perCounty = new Map<string, { matched: number; nearbyUnmatched: number }>();
  const countyRow = (fips: string) => {
    if (!perCounty.has(fips)) perCounty.set(fips, { matched: 0, nearbyUnmatched: 0 });
    return perCounty.get(fips)!;
  };
  let seen = 0;
  let byAddress = 0;
  let byDistance = 0;
  let disagreements = 0;
  let nearbyUnmatched = 0;
  let farFromHouses = 0;

  let batch: Array<{ updateOne: { filter: { _id: unknown }; update: object } }> = [];
  const flush = async () => {
    if (batch.length === 0) return;
    if (!options.dryRun) await Model.bulkWrite(batch as never, { ordered: false });
    batch = [];
  };

  const cursor = Model.find({ location: { $exists: true } }, { location: 1, "address.line": 1 }).lean().cursor();
  for await (const item of cursor as AsyncIterable<{ _id: unknown; location: { coordinates: [number, number] }; address?: { line?: string } }>) {
    seen++;
    const [lon, lat] = item.location.coordinates;
    const target = { lat, lng: lon, addressLine: item.address?.line ?? "" };
    const candidates = await housesWithin(lon, lat, MATCH.addressSearchMeters);
    const match = matchToHome(target, candidates);

    if (match) {
      countyRow(candidates.find((c) => c.id === match.homeId)!.fips).matched++;
      if (match.method === "address") {
        byAddress++;
        const nearest = nearestWithin(target, candidates, MATCH.maxMeters);
        if (nearest && nearest.id !== match.homeId) disagreements++;
      } else {
        byDistance++;
      }
      const update = { $set: { homeId: match.homeId, matchMeters: Math.round(match.meters * 10) / 10, matchMethod: match.method } };
      batch.push({ updateOne: { filter: { _id: item._id }, update } });
    } else {
      const fips = await countyNearby(lon, lat);
      if (fips) {
        countyRow(fips).nearbyUnmatched++;
        nearbyUnmatched++;
      } else {
        farFromHouses++;
      }
      batch.push({ updateOne: { filter: { _id: item._id }, update: { $set: { homeId: null, matchMeters: null, matchMethod: null } } } });
    }
    if (batch.length >= BATCH_SIZE) await flush();
    if (seen % 20000 === 0) console.log(`[match] ${kind}: ${seen} checked`);
  }
  await flush();

  const withoutPosition = await Model.countDocuments({ location: { $exists: false } });
  if (!options.dryRun) await Model.updateMany({ location: { $exists: false } }, { $set: { homeId: null, matchMeters: null, matchMethod: null } });

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  const matched = byAddress + byDistance;
  console.log(
    `[match] ${kind}: ${seen} with a position (${withoutPosition} without); matched ${matched} (${pct(matched, seen)}): ` +
      `by address ${byAddress}, by distance ${byDistance}; the nearest house within ${MATCH.maxMeters} m was a different one for ${disagreements} address matches; ` +
      `unmatched near a loaded house ${nearbyUnmatched}, far from any loaded house ${farFromHouses}`
  );
  const counties = [...perCounty.entries()].sort((a, b) => b[1].matched - a[1].matched);
  console.log(`[match] ${kind} by county (fips matched/nearby-unmatched): ${counties.map(([fips, c]) => `${fips} ${c.matched}/${c.nearbyUnmatched}`).join(", ")}`);

  if (!options.dryRun) {
    const matchedField = kind === "doors" ? "doorsMatched" : "jobsMatched";
    const unmatchedField = kind === "doors" ? "doorsNearbyUnmatched" : "jobsNearbyUnmatched";
    await CanvassCountyQualityModel.updateMany({ source: QUALITY_SOURCE }, { $set: { [matchedField]: 0, [unmatchedField]: 0 } });
    for (const [fips, c] of perCounty) {
      await CanvassCountyQualityModel.updateOne({ fips, source: QUALITY_SOURCE }, { $set: { [matchedField]: c.matched, [unmatchedField]: c.nearbyUnmatched } });
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
  await mongoose.connect(options.uri);
  for (const kind of ["jobs", "doors"] as Kind[]) {
    if (!options.only || options.only === kind) await matchKind(kind, options);
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[match] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
