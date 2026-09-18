// scripts/canvass-jcad-prepare.ts
// Turns Johnson County Appraisal District's 2026 certified tab files into one line
// per property for the Canvass Map: account, state code, homestead, year built,
// roof material.
//
//   npx vite-node scripts/canvass-jcad-prepare.ts --dir D:/knock-planner/data/johnson/2026/files
//
// Options:
//   --dir <folder>   the extracted externalnal.tab, externalexemptions.tab and externalbldse.tab
//   --out <file>     default <dir>/district-properties.jsonl
//
// A JCAD ACCOUNT (R000000130) is the state file's Prop_ID. The output feeds
// scripts/canvass-import-parcels.ts --district ... --district-source jcad. Only
// accounts, codes, years and roof materials are read; the owner names and
// addresses in externalnal.tab are never read. Prints counts only.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { earliestYearBuilt } from "../src/lib/canvass/appraisal";
import { isDistrictHome, type DistrictProperty } from "../src/lib/canvass/district";
import { accountDigits, isJohnsonHomesteadCode, johnsonRoofLabel } from "../src/lib/canvass/jcad";

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

/** Calls onRow(get) for each data line of a tab file with a header row; get(name) reads one column. */
async function eachRow(file: string, onRow: (get: (name: string) => string) => void): Promise<number> {
  const reader = readline.createInterface({ input: fs.createReadStream(file, "latin1"), crlfDelay: Infinity });
  let header: Map<string, number> | null = null;
  let rows = 0;
  for await (const raw of reader) {
    const fields = raw.replace(/\r$/, "").split("\t");
    if (!header) {
      header = new Map(fields.map((name, index) => [name.trim(), index]));
      continue;
    }
    const columns = header;
    rows++;
    onRow((name) => (fields[columns.get(name) ?? -1] ?? "").trim());
  }
  return rows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const thisYear = new Date().getFullYear();

  const accounts = new Map<string, { stateCode: string; years: string[] }>();
  const accountByDigits = new Map<string, string>();
  const nalRows = await eachRow(path.join(options.dir, "externalnal.tab"), (get) => {
    const account = get("ACCOUNT");
    if (!account) return;
    const entry = accounts.get(account) ?? { stateCode: "", years: [] };
    if (!entry.stateCode) entry.stateCode = get("BUILDING PTD") || get("LAND PTD");
    entry.years.push(get("YEAR_BUILT"));
    accounts.set(account, entry);
    accountByDigits.set(accountDigits(account), account);
  });

  const homesteads = new Set<string>();
  const exemptionRows = await eachRow(path.join(options.dir, "externalexemptions.tab"), (get) => {
    if (isJohnsonHomesteadCode(get("EXEMPT CD"))) homesteads.add(get("ACCOUNT"));
  });

  const roofs = new Map<string, string>();
  let roofRowsWithoutAccount = 0;
  const featureRows = await eachRow(path.join(options.dir, "externalbldse.tab"), (get) => {
    if (get("tp_dscr").toLowerCase() !== "roofing") return;
    const label = johnsonRoofLabel(get("cd_dscr"));
    if (!label) return;
    const account = accountByDigits.get(accountDigits(get("parcel_id")));
    if (!account) {
      roofRowsWithoutAccount++;
      return;
    }
    if (!roofs.has(account)) roofs.set(account, label);
  });

  const out = fs.createWriteStream(`${options.out}.part`, { encoding: "utf8" });
  let homes = 0;
  let withYear = 0;
  let withHomestead = 0;
  let withRoof = 0;
  for (const [account, entry] of accounts) {
    const property: DistrictProperty = {
      propId: account,
      stateCode: entry.stateCode,
      homestead: homesteads.has(account),
      yearBuilt: earliestYearBuilt(entry.years, thisYear),
      roofMaterial: roofs.get(account) ?? "",
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
    `[jcad] ${nalRows} property rows, ${exemptionRows} exemption rows, ${featureRows} building feature rows (${roofRowsWithoutAccount} roof rows with no account); ` +
      `${accounts.size} properties written to ${path.basename(options.out)}`
  );
  console.log(
    `[jcad] homes by district code ${homes}: year built ${withYear} (${pct(withYear, homes)}), homestead ${withHomestead} (${pct(withHomestead, homes)}), ` +
      `roof material ${withRoof} (${pct(withRoof, homes)})`
  );
}

main().catch((error) => {
  console.error("[jcad] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
