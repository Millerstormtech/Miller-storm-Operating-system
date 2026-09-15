// scripts/canvass-swds-prepare.ts
// Turns a Southwest Data Solutions "web file" export (the format Hood CAD and
// Midland CAD publish) into one line per property for the Canvass Map: property
// id, state code, homestead, year built of the main area. These files have no
// roof data.
//
//   npx vite-node scripts/canvass-swds-prepare.ts --dir D:/knock-planner/data/hood/2026/files
//
// Options:
//   --dir <folder>   the extracted export_webprop.txt, export_webbld.txt and export_webxbld.txt
//   --out <file>     default <dir>/district-properties.jsonl
//
// Only real-property accounts (R...) are kept: their id without the R and leading
// zeros is the state file's Prop_ID. The files are comma-separated with no
// quoting, so a row whose column count is wrong is skipped and counted. The output
// feeds scripts/canvass-import-parcels.ts --district ... --district-source hcad
// (or mcad). Owner names and addresses are never read. Prints counts only.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { earliestYearBuilt } from "../src/lib/canvass/appraisal";
import { isDistrictHome, type DistrictProperty } from "../src/lib/canvass/district";
import { isSwdsHomesteadCode, mainAreaCodes, swdsPropId } from "../src/lib/canvass/swds";

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

/** Calls onRow(get) for each well-formed data line of a comma file with a header row. Returns rows read and rows skipped. */
async function eachRow(file: string, onRow: (get: (name: string) => string) => void): Promise<{ rows: number; skipped: number }> {
  const reader = readline.createInterface({ input: fs.createReadStream(file, "latin1"), crlfDelay: Infinity });
  let header: Map<string, number> | null = null;
  let rows = 0;
  let skipped = 0;
  for await (const raw of reader) {
    const fields = raw.replace(/\r$/, "").split(",");
    if (!header) {
      header = new Map(fields.map((name, index) => [name.trim(), index]));
      continue;
    }
    if (fields.length !== header.size) {
      skipped++;
      continue;
    }
    const columns = header;
    rows++;
    onRow((name) => (fields[columns.get(name) ?? -1] ?? "").trim());
  }
  return { rows, skipped };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const thisYear = new Date().getFullYear();

  const codeRows: Array<{ code: string; mainArea: string }> = [];
  await eachRow(path.join(options.dir, "export_webxbld.txt"), (get) => codeRows.push({ code: get("webxbld_code"), mainArea: get("webxbld_ma") }));
  const mainArea = mainAreaCodes(codeRows);

  const properties = new Map<string, { stateCode: string; homestead: boolean }>();
  const props = await eachRow(path.join(options.dir, "export_webprop.txt"), (get) => {
    const propId = swdsPropId(get("webprop_id"));
    if (!propId) return;
    const existing = properties.get(propId);
    const stateCode = get("webprop_ptdimp") || get("webprop_ptdlnd");
    const homestead = isSwdsHomesteadCode(get("webprop_hscode"));
    properties.set(propId, {
      stateCode: existing?.stateCode || stateCode,
      homestead: (existing?.homestead ?? false) || homestead,
    });
  });

  const years = new Map<string, string[]>();
  const buildings = await eachRow(path.join(options.dir, "export_webbld.txt"), (get) => {
    if (!mainArea.has(get("webbld_code").toUpperCase())) return;
    const propId = swdsPropId(get("webbld_id"));
    if (!propId) return;
    const list = years.get(propId) ?? [];
    list.push(get("webbld_constyr"));
    years.set(propId, list);
  });

  const out = fs.createWriteStream(`${options.out}.part`, { encoding: "utf8" });
  let homes = 0;
  let withYear = 0;
  let withHomestead = 0;
  for (const [propId, entry] of properties) {
    const property: DistrictProperty = {
      propId,
      stateCode: entry.stateCode,
      homestead: entry.homestead,
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
    `[swds] ${path.basename(path.dirname(options.dir))}: main-area codes ${[...mainArea].join(" ")}; property rows ${props.rows} (skipped ${props.skipped}), ` +
      `building rows ${buildings.rows} (skipped ${buildings.skipped}); ${properties.size} real properties written to ${path.basename(options.out)}`
  );
  console.log(`[swds] homes by district code ${homes}: year built ${withYear} (${pct(withYear, homes)}), homestead ${withHomestead} (${pct(withHomestead, homes)})`);
}

main().catch((error) => {
  console.error("[swds] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
