#!/usr/bin/env node
/**
 * One-shot MongoDB backup. Dumps every collection in the `millerstorm` database
 * to gzipped NDJSON (one JSON document per line) under a dated folder, then
 * prunes folders older than the retention window.
 *
 * Why the driver and not mongodump: mongodump is not installed on the VPS and
 * the database is small. Streaming each collection through a cursor into a gzip
 * stream keeps memory flat regardless of collection size.
 *
 *   node scripts/backup-mongo.js
 *
 * Env:
 *   MONGODB_URI          (required; read from .env if present)
 *   BACKUP_DIR           where to write (default /var/www/millerstorm-backups)
 *   BACKUP_RETAIN_DAYS   how many dated folders to keep (default 14)
 *
 * NOTE: writing to local disk protects against corruption and accidental
 * deletes, not disk failure. Copy BACKUP_DIR off the box (rclone/scp/S3) to be
 * safe against losing the server itself.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const { MongoClient } = require("mongodb");

function loadEnv() {
  const file = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq === -1) continue;
    const k = s.slice(0, eq).trim();
    const v = s.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const baseDir = process.env.BACKUP_DIR || "/var/www/millerstorm-backups";
  const retainDays = Number(process.env.BACKUP_RETAIN_DAYS || 14);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-"); // YYYY-MM-DD-HH-MM-SS
  const outDir = path.join(baseDir, `millerstorm-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("millerstorm");
  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();

  const summary = [];
  for (const name of collections) {
    const cursor = db.collection(name).find({});
    let count = 0;
    async function* lines() {
      for await (const doc of cursor) {
        count++;
        yield JSON.stringify(doc) + "\n";
      }
    }
    const gz = fs.createWriteStream(path.join(outDir, `${name}.ndjson.gz`));
    await pipeline(Readable.from(lines()), zlib.createGzip(), gz);
    summary.push({ collection: name, documents: count });
  }
  await client.close();

  fs.writeFileSync(
    path.join(outDir, "_manifest.json"),
    JSON.stringify({ finishedAt: new Date().toISOString(), database: "millerstorm", collections: summary }, null, 2)
  );

  // Prune old dated folders.
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const entry of fs.readdirSync(baseDir)) {
    if (!entry.startsWith("millerstorm-")) continue;
    const full = path.join(baseDir, entry);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.rmSync(full, { recursive: true, force: true });
        pruned++;
      }
    } catch {
      /* ignore a folder that vanished under us */
    }
  }

  const totalDocs = summary.reduce((a, s) => a + s.documents, 0);
  console.log(`[backup] ${outDir} — ${collections.length} collections, ${totalDocs} docs, pruned ${pruned} old backup(s)`);
}

main().catch((e) => {
  console.error("[backup] FAILED", e);
  process.exit(1);
});
