// scripts/canvass-wcad-download.ts
// Downloads the three Williamson Central Appraisal District open-data tables the
// Canvass Map needs, as JSON lines, from data.wcad.org (Socrata; free, no key).
// Read-only toward WCAD, one page at a time with a pause between pages.
//
//   npx vite-node scripts/canvass-wcad-download.ts --out D:/knock-planner/data/wcad/2026
//
// Options:
//   --out <folder>      where the files go (required)
//   --page-size <n>     rows per request, default 50000
//   --max-pages <n>     stop a table after n pages, default 60 (a cap: 3 million rows)
//   --delay-ms <n>      pause between requests, default 500
//
// Files written (each first as .part, renamed when complete):
//   segments-main-area.jsonl    {quickrefid, actyrbuilt}: Main Area building parts only
//   properties.jsonl            {propertyid, quickrefid}
//   homestead-exemptions.jsonl  {propertyid, exemptiontypedescription, exemptionstatuscode}: Homestead rows, every status
//
// Only ids, years and exemption codes are requested: no owner or applicant names,
// no addresses.

import fs from "node:fs";
import path from "node:path";

const BASE = "https://data.wcad.org/resource";

type Table = { file: string; dataset: string; select: string; where?: string };

const TABLES: Table[] = [
  { file: "segments-main-area.jsonl", dataset: "4kxj-e8c3", select: "quickrefid,type,actyrbuilt", where: "type='MA'" },
  { file: "properties.jsonl", dataset: "ai3c-c9pf", select: "propertyid,quickrefid" },
  {
    file: "homestead-exemptions.jsonl",
    dataset: "nbn7-h4pp",
    select: "propertyid,exemptiontypedescription,exemptionstatuscode",
    where: "exemptiontypedescription='Homestead'",
  },
];

type Options = { out: string; pageSize: number; maxPages: number; delayMs: number };

function parseArgs(argv: string[]): Options {
  const options: Options = { out: "", pageSize: 50000, maxPages: 60, delayMs: 500 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") options.out = argv[++i] ?? "";
    else if (arg === "--page-size") options.pageSize = Number(argv[++i]);
    else if (arg === "--max-pages") options.maxPages = Number(argv[++i]);
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++i]);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.out) throw new Error("--out is required");
  if (!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 50000) throw new Error("--page-size must be 1 to 50000");
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1) throw new Error("--max-pages must be 1 or more");
  return options;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(table: Table, pageSize: number, offset: number): Promise<Record<string, unknown>[]> {
  const url = new URL(`${BASE}/${table.dataset}.json`);
  url.searchParams.set("$select", table.select);
  if (table.where) url.searchParams.set("$where", table.where);
  url.searchParams.set("$order", ":id");
  url.searchParams.set("$limit", String(pageSize));
  url.searchParams.set("$offset", String(offset));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(120000) });
    if (res.ok) return (await res.json()) as Record<string, unknown>[];
    if (attempt === 3 || (res.status !== 429 && res.status < 500)) throw new Error(`${table.dataset} offset ${offset}: HTTP ${res.status}`);
    await sleep(2000 * attempt);
  }
  return [];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.out, { recursive: true });

  for (const table of TABLES) {
    const finalPath = path.join(options.out, table.file);
    const partPath = `${finalPath}.part`;
    const stream = fs.createWriteStream(partPath, { encoding: "utf8" });
    let rows = 0;
    let pages = 0;
    let complete = false;
    for (let offset = 0; pages < options.maxPages; offset += options.pageSize) {
      const page = await fetchPage(table, options.pageSize, offset);
      pages++;
      for (const row of page) stream.write(`${JSON.stringify(row)}\n`);
      rows += page.length;
      if (page.length < options.pageSize) {
        complete = true;
        break;
      }
      await sleep(options.delayMs);
    }
    await new Promise<void>((resolve, reject) => stream.end((error?: Error | null) => (error ? reject(error) : resolve())));
    if (!complete) throw new Error(`${table.file}: stopped at the ${options.maxPages}-page cap before the end; nothing renamed`);
    fs.renameSync(partPath, finalPath);
    console.log(`[wcad] ${table.file}: ${rows} rows in ${pages} pages`);
  }
}

main().catch((error) => {
  console.error("[wcad] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
