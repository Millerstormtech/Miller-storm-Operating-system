// scripts/canvass-hail-assign.ts
// Gives every Canvass Map house the storm days whose radar hail square covers
// it, from the squares loaded by scripts/canvass-hail-load.ts.
//
//   npx vite-node scripts/canvass-hail-assign.ts
//
// Options:
//   --from <YYYY-MM-DD> --to <YYYY-MM-DD>   only these storm days (default: all loaded days)
//   --min-inches <n>                         smallest hail kept, default 1 (the grade's smallest band)
//   --uri <mongodb>                          database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote                           required to write to anything but the local test database
//   --dry-run                                count only, write nothing
//
// Re-runnable: it first removes the house hail it is about to recompute (all of
// it, or only the requested days). Houses are matched to squares one small area
// at a time, so a storm across half of Texas never loads every house at once.
// Run after the house import: a --replace house reload erases hail.

import mongoose from "mongoose";
import { assignHail } from "../src/lib/canvass/hailAssign";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassHailCellModel } from "../src/lib/models/CanvassHailCell";

const TILE_DEGREES = 0.25;
const BATCH_SIZE = 5000;

type Options = { from: string; to: string; minInches: number; uri: string; allowRemote: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { from: "", to: "", minInches: 1, uri: "mongodb://127.0.0.1:27017/millerstorm", allowRemote: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") options.from = argv[++i] ?? "";
    else if (arg === "--to") options.to = argv[++i] ?? "";
    else if (arg === "--min-inches") options.minInches = Number(argv[++i]);
    else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if ((options.from && !options.to) || (!options.from && options.to)) throw new Error("--from and --to go together");
  if (!Number.isFinite(options.minInches) || options.minInches <= 0) throw new Error("--min-inches must be a positive number");
  return options;
}

const tileOf = (lat: number, lon: number) => `${Math.floor(lat / TILE_DEGREES)}|${Math.floor(lon / TILE_DEGREES)}`;

/** A tile's box, padded by one hail square so houses on its edge are not missed. */
function tileBox(tile: string) {
  const [latIndex, lonIndex] = tile.split("|").map(Number);
  const south = latIndex * TILE_DEGREES - 0.01;
  const north = (latIndex + 1) * TILE_DEGREES + 0.01;
  const west = lonIndex * TILE_DEGREES - 0.01;
  const east = (lonIndex + 1) * TILE_DEGREES + 0.01;
  return { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalTestDatabase(options.uri) && !options.allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
  await mongoose.connect(options.uri);

  const dayFilter: Record<string, unknown> = { inches: { $gte: options.minInches } };
  if (options.from) dayFilter.stormDate = { $gte: options.from, $lte: options.to };
  const days = ((await CanvassHailCellModel.distinct("stormDate", dayFilter)) as string[]).sort();

  if (!options.dryRun) {
    const cleared = options.from
      ? await CanvassHomeModel.updateMany({}, { $pull: { hail: { date: { $gte: options.from, $lte: options.to } } } })
      : await CanvassHomeModel.updateMany({}, { $set: { hail: [] } });
    console.log(`[hail-assign] cleared hail on ${cleared.modifiedCount} houses before recomputing`);
  }

  let totalEvents = 0;
  const housesWithHail = new Set<string>();
  for (const day of days) {
    const squares = (await CanvassHailCellModel.find({ stormDate: day, inches: { $gte: options.minInches } }, { location: 1, inches: 1 }).lean()) as Array<{
      location: { coordinates: [number, number] };
      inches: number;
    }>;
    const byTile = new Map<string, Array<{ stormDate: string; lat: number; lon: number; inches: number }>>();
    for (const s of squares) {
      const [lon, lat] = s.location.coordinates;
      const tile = tileOf(lat, lon);
      if (!byTile.has(tile)) byTile.set(tile, []);
      byTile.get(tile)!.push({ stormDate: day, lat, lon, inches: s.inches });
    }

    let dayEvents = 0;
    let batch: Array<{ updateOne: { filter: { _id: string }; update: object } }> = [];
    const flush = async () => {
      if (batch.length === 0) return;
      if (!options.dryRun) await CanvassHomeModel.bulkWrite(batch as never, { ordered: false });
      batch = [];
    };

    for (const [tile, tileSquares] of byTile) {
      const found = (await CanvassHomeModel.find({ location: { $geoWithin: { $geometry: tileBox(tile) } } }, { location: 1 }).lean()) as Array<{
        _id: unknown;
        location: { coordinates: [number, number] };
      }>;
      // Tile edges fall on hail-square edges (0.25 degree is 25 squares), so a
      // house and the square over it always share a tile. Houses the padded box
      // catches from a neighboring tile are left for that tile.
      const spots = found
        .map((h) => ({ id: String(h._id), lat: h.location.coordinates[1], lon: h.location.coordinates[0] }))
        .filter((spot) => tileOf(spot.lat, spot.lon) === tile);
      if (spots.length === 0) continue;
      for (const [id, events] of assignHail(spots, tileSquares, options.minInches)) {
        housesWithHail.add(id);
        dayEvents += events.length;
        batch.push({ updateOne: { filter: { _id: id }, update: { $push: { hail: { $each: events } } } } });
        if (batch.length >= BATCH_SIZE) await flush();
      }
    }
    await flush();
    totalEvents += dayEvents;
    if (dayEvents > 0) console.log(`[hail-assign] ${day}: ${squares.length} squares, ${dayEvents} houses hit`);
  }

  console.log(
    `[hail-assign] done: ${days.length} storm days, ${totalEvents} house-storm pairs ${options.dryRun ? "counted" : "written"}, ${housesWithHail.size} houses with hail of ${options.minInches} in or more`
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[hail-assign] FAILED:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
