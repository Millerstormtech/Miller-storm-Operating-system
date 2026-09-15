// scripts/canvass-prad-prepare.ts
// Turns one county's Potter-Randall Appraisal District 2026 PACS export (the
// extracted fixed-width TXT files) into one line per property for the Canvass Map:
// property id, state code, homestead, year built of the house, roof cover.
//
//   npx vite-node scripts/canvass-prad-prepare.ts --dir D:/knock-planner/data/prad/2026/potter
//
// Options:
//   --dir <folder>   the extracted *_APPRAISAL_INFO.TXT, *_IMPROVEMENT_DETAIL.TXT and
//                    *_IMPROVEMENT_DETAIL_ATTR.TXT files for one county
//   --out <file>     default <dir>/district-properties.jsonl
//
// The output feeds scripts/canvass-import-parcels.ts --district, which lets PRAD
// decide which parcels are houses. Only ids, codes, years and roof covers are
// read; the owner names and addresses in the property file are never read.
// Prints counts only.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { earliestYearBuilt } from "../src/lib/canvass/appraisal";
import { isDistrictHome, type DistrictProperty } from "../src/lib/canvass/district";
import { mergeOwnerLines, pacsPropId, readImprovementAttributeRow, readImprovementDetailRow, readPropRow } from "../src/lib/canvass/pacs";
import { isPradMainArea, roofCoverLabel } from "../src/lib/canvass/prad";

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

function findFile(dir: string, suffix: string): string {
  const name = fs.readdirSync(dir).find((file) => file.toUpperCase().endsWith(suffix));
  if (!name) throw new Error(`No *${suffix} in ${dir}`);
  return path.join(dir, name);
}

async function eachLine(file: string, onLine: (line: string) => void): Promise<number> {
  const reader = readline.createInterface({ input: fs.createReadStream(file, "latin1"), crlfDelay: Infinity });
  let lines = 0;
  for await (const line of reader) {
    if (!line.trim()) continue;
    lines++;
    onLine(line);
  }
  return lines;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const thisYear = new Date().getFullYear();

  // One line per owner, with supplements: merge to one per property.
  type Line = { supNum: string; homestead: boolean; stateCode: string };
  const properties = new Map<string, Line>();
  const propertyLines = await eachLine(findFile(options.dir, "_APPRAISAL_INFO.TXT"), (line) => {
    const row = readPropRow(line);
    const propId = pacsPropId(row.propId);
    if (!propId) return;
    const current: Line = { supNum: row.supNum, homestead: row.homestead, stateCode: row.improvementStateCode || row.landStateCode };
    const existing = properties.get(propId);
    properties.set(propId, existing ? mergeOwnerLines(existing, current) : current);
  });

  const years = new Map<string, string[]>();
  const detailLines = await eachLine(findFile(options.dir, "_IMPROVEMENT_DETAIL.TXT"), (line) => {
    const row = readImprovementDetailRow(line);
    if (!isPradMainArea(row.typeCode)) return;
    const propId = pacsPropId(row.propId);
    const list = years.get(propId) ?? [];
    list.push(row.yearBuilt);
    years.set(propId, list);
  });

  const roofs = new Map<string, string>();
  const attributeLines = await eachLine(findFile(options.dir, "_IMPROVEMENT_DETAIL_ATTR.TXT"), (line) => {
    const row = readImprovementAttributeRow(line);
    if (row.description.toUpperCase() !== "ROOF COVER") return;
    const propId = pacsPropId(row.propId);
    const label = roofCoverLabel(row.code);
    if (label && !roofs.has(propId)) roofs.set(propId, label);
  });

  const out = fs.createWriteStream(`${options.out}.part`, { encoding: "utf8" });
  let homes = 0;
  let withYear = 0;
  let withHomestead = 0;
  let withRoof = 0;
  for (const [propId, line] of properties) {
    const property: DistrictProperty = {
      propId,
      stateCode: line.stateCode,
      homestead: line.homestead,
      yearBuilt: earliestYearBuilt(years.get(propId) ?? [], thisYear),
      roofMaterial: roofs.get(propId) ?? "",
    };
    out.write(`${JSON.stringify(property)}\n`);
    if (!isDistrictHome(property.stateCode, property.yearBuilt)) continue;
    homes++;
    if (property.yearBuilt !== null) withYear++;
    if (property.homestead) withHomestead++;
    if (property.roofMaterial) withRoof++;
  }
  await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
  fs.renameSync(`${options.out}.part`, options.out);

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  console.log(
    `[prad] ${path.basename(options.dir)}: ${propertyLines} property lines, ${detailLines} building parts, ${attributeLines} attributes; ` +
      `${properties.size} properties written to ${path.basename(options.out)}`
  );
  console.log(
    `[prad] homes by district code ${homes}: year built ${withYear} (${pct(withYear, homes)}), homestead ${withHomestead} (${pct(withHomestead, homes)}), ` +
      `roof cover ${withRoof} (${pct(withRoof, homes)})`
  );
}

main().catch((error) => {
  console.error("[prad] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
