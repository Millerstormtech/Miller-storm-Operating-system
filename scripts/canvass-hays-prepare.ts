// scripts/canvass-hays-prepare.ts
// Turns Hays Central Appraisal District's free "Property Data Export" into one
// line per property for the Canvass Map: property id, state code, homestead,
// year built of the house.
//
//   npx vite-node scripts/canvass-hays-prepare.ts --dir "D:/knock-planner/data/hays/2026 PROPERTY DATA EXPORT FILES AS OF 8-26-2026"
//
// Options:
//   --dir <folder>   the extracted PropertyDataExport<number>.txt files
//   --out <file>     default <dir>/district-properties.jsonl
//
// Hays does not use the PACS layout the other districts do (see
// canvass-pacs-prepare.ts); it ships six quoted-CSV tables shaped like
// Williamson's. The files carry no hint of which table they are, so each is
// identified by its header row (haysTableFromHeader).
//
// Roof is deliberately NOT read: the SEGMENT "Roof" column is a combined shape
// and material code ("HG-C", "G-M") whose material letter is a guess, and a
// wrong roof material on a house card is worse than a blank one.
//
// Only ids, codes, years and exemption codes are read; the owner names and
// addresses in the OWNER table are never read. Prints counts only.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { earliestYearBuilt } from "../src/lib/canvass/appraisal";
import { parseCsvLine } from "../src/lib/canvass/csv";
import { isDistrictHome, type DistrictProperty } from "../src/lib/canvass/district";
import { hasHomestead, haysPropId, haysTableFromHeader, type HaysTable } from "../src/lib/canvass/hays";
import { isMainAreaSegment } from "../src/lib/canvass/wcad";

type Options = { dir: string; out: string };

function parseArgs(argv: string[]): Options {
  const options: Options = { dir: "", out: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir") options.dir = argv[++i] ?? "";
    else if (arg === "--out") options.out = argv[++i] ?? "";
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.dir) throw new Error("--dir is required");
  if (!options.out) options.out = path.join(options.dir, "district-properties.jsonl");
  return options;
}

/** Read one quoted-CSV export file, handing each row to `onRow` as a name-to-value map. */
async function eachRow(file: string, onRow: (row: Record<string, string>) => void): Promise<number> {
  const reader = readline.createInterface({ input: fs.createReadStream(file, "latin1"), crlfDelay: Infinity });
  let header: string[] | null = null;
  let rows = 0;
  for await (const line of reader) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    if (!header) {
      header = fields.map((name) => name.trim());
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((name, i) => (row[name] = fields[i] ?? ""));
    rows++;
    onRow(row);
  }
  return rows;
}

/** Read only the header of a file, to learn which of the six tables it holds. */
async function tableOf(file: string): Promise<HaysTable> {
  const reader = readline.createInterface({ input: fs.createReadStream(file, "latin1"), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    reader.close();
    return haysTableFromHeader(parseCsvLine(line));
  }
  return "unknown";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const thisYear = new Date().getFullYear();

  const files = fs
    .readdirSync(options.dir)
    .filter((name) => name.toLowerCase().endsWith(".txt"))
    .map((name) => path.join(options.dir, name));
  if (files.length === 0) throw new Error(`No .txt export files in ${options.dir}`);

  const byTable = new Map<HaysTable, string>();
  for (const file of files) {
    const table = await tableOf(file);
    if (table !== "unknown" && !byTable.has(table)) byTable.set(table, file);
  }
  for (const needed of ["segment", "owner", "improvement"] as const) {
    if (!byTable.has(needed)) throw new Error(`No ${needed.toUpperCase()} table among the files in ${options.dir}`);
  }
  console.log(
    `[hays] tables: ${[...byTable.entries()].map(([table, file]) => `${table}=${path.basename(file)}`).join(", ")}`
  );

  // Year built: the Main Area segment is the house; porches and garages are not.
  const years = new Map<string, string[]>();
  const segmentRows = await eachRow(byTable.get("segment")!, (row) => {
    if (!isMainAreaSegment(row.Type ?? "")) return;
    const propId = haysPropId(row.QuickRefID ?? "");
    if (!propId) return;
    const list = years.get(propId) ?? [];
    list.push(row.ActYrBuilt ?? "");
    years.set(propId, list);
  });

  // The state code decides which parcels are houses; Hays has none in the state file.
  const codes = new Map<string, string>();
  const improvementRows = await eachRow(byTable.get("improvement")!, (row) => {
    const propId = haysPropId(row.QuickRefID ?? "");
    const code = (row.StateCode ?? "").trim().toUpperCase();
    if (!propId || !code || codes.has(propId)) return;
    codes.set(propId, code);
  });

  // One OWNER row per owner: a homestead on any of them counts.
  const homesteads = new Set<string>();
  const ownerRows = await eachRow(byTable.get("owner")!, (row) => {
    const propId = haysPropId(row.QuickRefID ?? "");
    if (propId && hasHomestead(row.ExemptionList ?? "")) homesteads.add(propId);
  });

  const propIds = new Set<string>([...codes.keys(), ...years.keys()]);
  const out = fs.createWriteStream(`${options.out}.part`, { encoding: "utf8" });
  let homes = 0;
  let withYear = 0;
  let withHomestead = 0;
  for (const propId of propIds) {
    const property: DistrictProperty = {
      propId,
      stateCode: codes.get(propId) ?? "",
      homestead: homesteads.has(propId),
      yearBuilt: earliestYearBuilt(years.get(propId) ?? [], thisYear),
      roofMaterial: "",
    };
    out.write(`${JSON.stringify(property)}\n`);
    if (!isDistrictHome(property.stateCode, property.yearBuilt)) continue;
    homes++;
    if (property.yearBuilt !== null) withYear++;
    if (property.homestead) withHomestead++;
  }
  await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
  fs.renameSync(`${options.out}.part`, options.out);

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  console.log(
    `[hays] ${segmentRows} segment rows, ${improvementRows} improvement rows, ${ownerRows} owner rows; ` +
      `${propIds.size} properties written to ${path.basename(options.out)}`
  );
  console.log(`[hays] homes by district code ${homes}: year built ${withYear} (${pct(withYear, homes)}), homestead ${withHomestead} (${pct(withHomestead, homes)})`);
}

main().catch((error) => {
  console.error("[hays] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
