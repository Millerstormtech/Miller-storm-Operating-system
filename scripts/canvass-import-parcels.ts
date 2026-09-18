// scripts/canvass-import-parcels.ts
// Loads one county's houses from the Texas state property file (TxGIO Land
// Parcels) into the Canvass Map, and records that county's data-quality row.
//
//   npx vite-node scripts/canvass-import-parcels.ts --folder D:/knock-planner/data/parcels/48219
//
// Options:
//   --folder <path>            an extracted county zip (the importer finds the .shp inside)
//   --source <name>            label for this import, default "txgio-2025"
//   --district <file>          an appraisal district's one-line-per-property file
//                              (for example from scripts/canvass-pacs-prepare.ts). The
//                              district then decides which parcels are houses and fills
//                              year built, homestead and roof cover in the same pass.
//   --district-source <label>  who made that file: dcad, wcad, prad, jcad, hcad, mcad,
//                              ecad (Ellis), tcad (Travis) or hays (required with --district)
//   --uri <mongodb>            database, default mongodb://127.0.0.1:27017/millerstorm
//   --allow-remote             required to write to any database not on this computer
//   --dry-run                  read and count only, write nothing
//   --replace                  delete the county's existing homes first, so homes a
//                              stricter filter no longer accepts do not linger. This is
//                              the BASE step: the separate appraisal-district fills
//                              (Dallas, Williamson), hail, matching and grades must be
//                              re-run for that county afterwards.
//
// Safety: it refuses anything but the local test database unless --allow-remote
// is given (src/lib/canvass/dbGuard.ts, which also refuses the SSH tunnel to the
// live database), and it never reads MONGODB_URI.
// It prints counts only, never owner names or addresses, and hides record details
// in database error messages.
//
// Property ids: a first pass over the attribute file measures how often Prop_ID
// and GEO_ID come back on a different address, and src/lib/canvass/propertyIds.ts
// picks the field that really identifies a property (Ector's 2025 Prop_ID is a
// group code). Records with the same id are then merged before anything is written
// (Hockley 2025: 101 ids, 189 extra records, same address each time), so the
// quality counts describe the same houses the map shows.
//
// Coordinates: the .prj beside the .shp names the coordinate system. 40 of our
// 41 county files are longitude/latitude; Martin County's 2025 file is Web
// Mercator and is converted. Any other system is refused before reading. Houses
// whose point lands outside Texas are dropped, and if more than 1% do, the county
// stops before anything is deleted or written.
//
// The state download site blocks scripts, so county zips are downloaded in a
// browser and unzipped first (spec B3).

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import mongoose from "mongoose";
import { parcelToHome, mergeHomes, type HomeRecord, type HomePiece } from "../src/lib/canvass/parcel";
import { outlineArea, type PolygonGeometry } from "../src/lib/canvass/geometry";
import { coordinateSystemOf, geometryToLonLat, isInsideTexasBox, type CoordinateSystem } from "../src/lib/canvass/coordinates";
import { chooseIdField, createIdConflictCounter, type IdField } from "../src/lib/canvass/propertyIds";
import { appraisalUpdate, type AppraisalUpdate, type YearBuiltSource } from "../src/lib/canvass/appraisal";
import { districtHomeCodes, type DistrictProperty } from "../src/lib/canvass/district";
import { SERVICE_COUNTIES, isServiceCounty } from "../src/lib/canvass/counties";
import { isLocalTestDatabase } from "../src/lib/canvass/dbGuard";
import { countyFlags, suggestedStatus, type CountyStats } from "../src/lib/canvass/quality";
import { CanvassHomeModel } from "../src/lib/models/CanvassHome";
import { CanvassCountyQualityModel } from "../src/lib/models/CanvassCountyQuality";

// Loaded through Node's own require on purpose. Under vite-node an ES import of
// `shapefile` picks the build that opens paths with fetch(), which fails on a
// local file ("fetch failed"). The CommonJS build reads from disk.
const shapefile: typeof import("shapefile") = createRequire(import.meta.url)("shapefile");

const BATCH_SIZE = 2000;
const MAX_OUTSIDE_TEXAS_SHARE = 0.01;
const DISTRICT_SOURCES: YearBuiltSource[] = ["dcad", "wcad", "prad", "jcad", "hcad", "mcad", "ecad", "tcad", "hays"];

type Options = {
  folder: string;
  source: string;
  district: string;
  districtSource: YearBuiltSource | null;
  uri: string;
  allowRemote: boolean;
  dryRun: boolean;
  replace: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    folder: "",
    source: "txgio-2025",
    district: "",
    districtSource: null,
    uri: "mongodb://127.0.0.1:27017/millerstorm",
    allowRemote: false,
    dryRun: false,
    replace: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--folder") options.folder = argv[++i] ?? "";
    else if (arg === "--source") options.source = argv[++i] ?? options.source;
    else if (arg === "--district") options.district = argv[++i] ?? "";
    else if (arg === "--district-source") {
      const value = (argv[++i] ?? "") as YearBuiltSource;
      if (!DISTRICT_SOURCES.includes(value)) throw new Error(`--district-source must be one of ${DISTRICT_SOURCES.join(", ")}`);
      options.districtSource = value;
    } else if (arg === "--uri") options.uri = argv[++i] ?? options.uri;
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--replace") options.replace = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.folder) throw new Error("--folder is required");
  if (Boolean(options.district) !== Boolean(options.districtSource)) throw new Error("--district and --district-source go together");
  return options;
}

function assertLocalUnlessAllowed(uri: string, allowRemote: boolean): void {
  if (!isLocalTestDatabase(uri) && !allowRemote) {
    throw new Error("Refusing to write to anything but the local test database. Pass --allow-remote only when approved.");
  }
}

function findFile(dir: string, extension: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, extension);
      if (found) return found;
    } else if (entry.name.toLowerCase().endsWith(extension)) {
      return full;
    }
  }
  return null;
}

/** MongoDB errors can quote a whole house record, owner name included. Logs keep counts only. */
function safeErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cut = message.indexOf("{");
  return cut >= 0 ? `${message.slice(0, cut).trim()} (record details hidden)` : message;
}

async function loadDistrict(file: string): Promise<Map<string, DistrictProperty>> {
  const properties = new Map<string, DistrictProperty>();
  const reader = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    const property = JSON.parse(line) as DistrictProperty;
    if (property.propId) properties.set(property.propId, property);
  }
  return properties;
}

type RunStats = CountyStats & { parcelsRead: number; repeatedRecords: number; homesFromBuildingOnly: number; taxYear: string };

function emptyStats(): RunStats {
  return {
    parcelsRead: 0,
    repeatedRecords: 0,
    homes: 0,
    withYearBuilt: 0,
    builtBefore1990: 0,
    withOwnerSignal: 0,
    ownerLivesHere: 0,
    withHomesteadSignal: 0,
    homesFromBuildingOnly: 0,
    taxYear: "",
  };
}

/**
 * Year built is only written when this file (or the district file) has one, so a
 * re-import of a county whose state file lacks it (Dallas) never erases a year
 * loaded from elsewhere. `extra` carries what a district file filled in.
 */
function upsertFor(home: HomeRecord, importedAt: Date, extra: AppraisalUpdate = {}) {
  const { yearBuilt, ...rest } = home;
  const update =
    yearBuilt !== null
      ? { $set: { ...rest, yearBuilt, yearBuiltSource: "txgio", ...extra, importedAt } }
      : { $set: { ...rest, ...extra, importedAt }, $setOnInsert: { yearBuilt: null, yearBuiltSource: null } };
  return { updateOne: { filter: { fips: home.fips, propId: home.propId }, update, upsert: true } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertLocalUnlessAllowed(options.uri, options.allowRemote);

  const shp = findFile(options.folder, ".shp");
  if (!shp) throw new Error(`No .shp file found under ${options.folder}`);
  const cpg = findFile(options.folder, ".cpg");
  const encoding = cpg && /utf-?8/i.test(fs.readFileSync(cpg, "utf8")) ? "utf-8" : "windows-1252";
  const prj = shp.replace(/\.shp$/i, ".prj");
  const system: CoordinateSystem = fs.existsSync(prj) ? coordinateSystemOf(fs.readFileSync(prj, "utf8")) : "lon-lat";
  if (system === "unknown") throw new Error(`Unsupported coordinate system in ${path.basename(prj)}; nothing was read, deleted or written`);

  const district = options.district ? await loadDistrict(options.district) : null;
  const districtHomes = district ? districtHomeCodes(district.values()) : undefined;
  if (district && districtHomes) {
    console.log(`[parcels] district file (${options.districtSource}): ${district.size} properties, ${districtHomes.size} homes by district code`);
  }

  // Pass 0: which field identifies a property in this file.
  const idCounter = createIdConflictCounter();
  const attributes = await shapefile.openDbf(shp.replace(/\.shp$/i, ".dbf"), { encoding });
  for (;;) {
    const { done, value } = await attributes.read();
    if (done) break;
    idCounter.add({ propId: String(value.Prop_ID ?? ""), geoId: String(value.GEO_ID ?? ""), address: String(value.SITUS_ADDR ?? "") });
  }
  const idCounts = idCounter.counts();
  const idField: IdField = chooseIdField(idCounts);
  const idConflicts = idField === "GEO_ID" ? idCounts.geoIdConflicts : idCounts.propIdConflicts;
  console.log(
    `[parcels] property id field: ${idField} (reused on another address: Prop_ID ${idCounts.propIdConflicts} of ${idCounts.propIdValues}, ` +
      `GEO_ID ${idCounts.geoIdConflicts} of ${idCounts.geoIdValues})`
  );

  const thisYear = new Date().getFullYear();
  const importedAt = new Date();
  const statsByFips = new Map<string, RunStats>();
  const statsFor = (fips: string) => {
    if (!statsByFips.has(fips)) statsByFips.set(fips, emptyStats());
    return statsByFips.get(fips)!;
  };

  // Pass 1: read every record and merge repeats of the same property id.
  console.log(`[parcels] reading ${path.basename(shp)} (${encoding}, ${system})${options.dryRun ? " DRY RUN" : ""}`);
  const source = await shapefile.open(shp, undefined, { encoding });
  const houses = new Map<string, HomePiece>();
  let parcelsRead = 0;
  let skippedOtherCounty = 0;
  for (;;) {
    const { done, value } = await source.read();
    if (done) break;
    parcelsRead++;
    if (parcelsRead % 50000 === 0) console.log(`[parcels] ${parcelsRead} records read`);

    const fipsDigits = String(value.properties.FIPS ?? "").replace(/\D/g, "");
    const stats = statsFor(fipsDigits.length === 3 ? `48${fipsDigits}` : fipsDigits);
    stats.parcelsRead++;
    if (!stats.taxYear) stats.taxYear = String(value.properties.TAX_YEAR ?? "").trim();

    const outline =
      value.geometry && (value.geometry.type === "Polygon" || value.geometry.type === "MultiPolygon")
        ? (value.geometry as PolygonGeometry)
        : null;
    const geometry = outline ? geometryToLonLat(outline, system) : null;
    const home = parcelToHome(value.properties, geometry, thisYear, idField, districtHomes);
    if (!home) continue;
    if (!isServiceCounty(home.fips)) {
      skippedOtherCounty++;
      continue;
    }

    const key = `${home.fips}|${home.propId}`;
    const piece: HomePiece = { home, area: geometry ? outlineArea(geometry) : 0 };
    const existing = houses.get(key);
    if (existing) {
      houses.set(key, mergeHomes(existing, piece));
      statsFor(home.fips).repeatedRecords++;
    } else {
      houses.set(key, piece);
    }
  }

  // A point outside Texas means a broken outline or a misread coordinate system.
  // A few are dropped; more than 1% stops the county before anything is deleted.
  let outsideTexas = 0;
  for (const [key, { home }] of houses) {
    if (!isInsideTexasBox(home.location.coordinates)) {
      houses.delete(key);
      outsideTexas++;
    }
  }
  if (outsideTexas > 0) console.log(`[parcels] ${outsideTexas} houses dropped: map point outside Texas`);
  if (outsideTexas > MAX_OUTSIDE_TEXAS_SHARE * (houses.size + outsideTexas)) {
    throw new Error(`${outsideTexas} of ${houses.size + outsideTexas} houses have a map point outside Texas; nothing was deleted or written`);
  }

  // District facts (year built, homestead, roof cover) go onto the houses before counting.
  const extras = new Map<string, AppraisalUpdate>();
  let districtAddresses = 0;
  let districtOwnerVerdicts = 0;
  if (district && options.districtSource) {
    for (const [key, piece] of houses) {
      const record = district.get(piece.home.propId);
      if (!record) continue;
      const update = appraisalUpdate({ yearBuilt: record.yearBuilt, roofMaterial: record.roofMaterial, homestead: record.homestead }, options.districtSource);
      if (update.yearBuilt !== undefined) piece.home.yearBuilt = update.yearBuilt;
      if (update.ownerLivesHere) piece.home.ownerLivesHere = true;
      // The district's own numbered street line wins over the state file's. The
      // Travis review (17 Sep 2026) found the state line was an owner's office, a
      // PO Box or a neighbour's number on 10,442 houses (3.5%) while the district's
      // situs was right on every one; the state line is kept only when the district
      // has no house number to offer.
      if (record.address?.line && (/^\d/.test(record.address.line) || !piece.home.address.line)) {
        if (record.address.line !== piece.home.address.line) districtAddresses++;
        piece.home.address = {
          line: record.address.line,
          city: record.address.city || piece.home.address.city,
          zip: record.address.zip || piece.home.address.zip,
        };
      }
      // Same for the owner check: a homestead only ever says "yes", so without this
      // a county with no state-file addresses can never see a rental.
      if (piece.home.ownerLivesHere === null && record.ownerLivesHere !== undefined && record.ownerLivesHere !== null) {
        piece.home.ownerLivesHere = record.ownerLivesHere;
        districtOwnerVerdicts++;
      }
      extras.set(key, update);
    }
    const unmatched = (districtHomes?.size ?? 0) - houses.size;
    console.log(`[parcels] ${houses.size} houses from the district list; ${Math.max(0, unmatched)} district homes have no state-file parcel`);
    if (districtAddresses || districtOwnerVerdicts) {
      console.log(`[parcels] filled from the district where the state file was blank: ${districtAddresses} addresses, ${districtOwnerVerdicts} owner checks`);
    }
  }

  // Pass 2: count and write the merged houses.
  if (!options.dryRun) {
    await mongoose.connect(options.uri);
    await CanvassHomeModel.createIndexes();
    await CanvassCountyQualityModel.createIndexes();
  }

  if (options.replace && !options.dryRun) {
    for (const fips of statsByFips.keys()) {
      if (!isServiceCounty(fips)) continue;
      const { deletedCount } = await CanvassHomeModel.deleteMany({ fips });
      console.log(`[parcels] --replace: removed ${deletedCount} existing homes for ${fips}`);
    }
  }

  let written = 0;
  let batch: ReturnType<typeof upsertFor>[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    if (!options.dryRun) await CanvassHomeModel.bulkWrite(batch, { ordered: false });
    written += batch.length;
    batch = [];
  };

  for (const [key, { home }] of houses) {
    const stats = statsFor(home.fips);
    stats.homes++;
    if (home.landUseSource === "building") stats.homesFromBuildingOnly++;
    if (home.yearBuilt !== null) {
      stats.withYearBuilt++;
      if (home.yearBuilt < 1990) stats.builtBefore1990++;
    }
    if (home.ownerLivesHere !== null) {
      stats.withOwnerSignal++;
      if (home.ownerLivesHere) stats.ownerLivesHere++;
      // Where the signal came from: a homestead can only ever say "lives here",
      // so a county carried entirely by homesteads reads 100% by arithmetic.
      if (extras.get(key)?.ownerSignalSource === "homestead") {
        stats.withHomesteadSignal = (stats.withHomesteadSignal ?? 0) + 1;
      }
    }
    batch.push(upsertFor(home, importedAt, extras.get(key)));
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  for (const [fips, stats] of statsByFips) {
    const county = SERVICE_COUNTIES.find((c) => c.fips === fips);
    if (!county) continue;
    const flags = countyFlags({ ...stats, records: stats.parcelsRead, idConflicts });
    const row = {
      fips,
      county: county.name,
      area: county.area,
      source: options.source,
      taxYear: stats.taxYear,
      parcelsRead: stats.parcelsRead,
      repeatedRecords: stats.repeatedRecords,
      idField,
      idConflicts,
      homes: stats.homes,
      withYearBuilt: stats.withYearBuilt,
      builtBefore1990: stats.builtBefore1990,
      withOwnerSignal: stats.withOwnerSignal,
      ownerLivesHere: stats.ownerLivesHere,
      withHomesteadSignal: stats.withHomesteadSignal,
      homesFromBuildingOnly: stats.homesFromBuildingOnly,
      flags,
      suggestedStatus: suggestedStatus(flags),
      importedAt,
    };
    if (!options.dryRun) {
      const addSource = options.districtSource ? { $addToSet: { extraSources: options.districtSource } } : {};
      await CanvassCountyQualityModel.updateOne({ fips, source: options.source }, { $set: row, ...addSource }, { upsert: true });
    }
    const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
    console.log(
      `[parcels] ${county.name} (${fips}): ${stats.parcelsRead} records, id ${idField}, ${stats.repeatedRecords} repeats merged, ${stats.homes} homes ` +
        `(${stats.homesFromBuildingOnly} guessed from a building), ` +
        `year built ${pct(stats.withYearBuilt, stats.homes)}, built before 1990 ${pct(stats.builtBefore1990, stats.withYearBuilt)}, ` +
        `owner lives here ${pct(stats.ownerLivesHere, stats.withOwnerSignal)} of ${pct(stats.withOwnerSignal, stats.homes)} known, ` +
        `flags [${flags.join(", ")}], suggested ${row.suggestedStatus}`
    );
  }

  console.log(
    `[parcels] done: ${parcelsRead} records read, ${written} homes ${options.dryRun ? "counted" : "written"}, ${skippedOtherCounty} outside our counties`
  );
  if (!options.dryRun) await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[parcels] FAILED:", safeErrorText(error));
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
