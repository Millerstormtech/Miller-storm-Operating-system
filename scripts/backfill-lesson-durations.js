#!/usr/bin/env node
/**
 * One-off: store each Vimeo lesson's length (pages[].durationSeconds) so the
 * Training Center can show "4 min" per lesson and "45 min left" per course
 * (2026-09-13). Lessons saved in the Course Builder from now on fill their own
 * length (src/lib/lessonDurations.ts); this covers everything saved before.
 *
 * Lengths come from Vimeo's public oEmbed endpoint: no API key, no cost.
 * Only a field that does not exist yet is added, one page at a time with an
 * array filter, so a course being edited at the same moment is never
 * overwritten. Undo with $unset of pages.$[].durationSeconds.
 *
 * Usage (from the repo root, with MONGODB_URI in .env or the environment):
 *   node scripts/backfill-lesson-durations.js            # dry run: prints what it would set
 *   node scripts/backfill-lesson-durations.js --apply    # writes
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

function loadEnv() {
  const p = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

// Same rules as src/lib/training/vimeo-oembed.ts (a plain script cannot import TypeScript).
function vimeoRefOf(videoUrl, body) {
  const url = String(videoUrl || "");
  const fromUrl = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})(?:\/([0-9a-f]{6,}))?/i);
  if (fromUrl) {
    const hashParam = url.match(/[?&]h=([0-9a-f]{6,})/i);
    return { id: fromUrl[1], hash: fromUrl[2] || (hashParam ? hashParam[1] : null) };
  }
  const fromBody = String(body || "").match(/player\.vimeo\.com\/video\/(\d{6,})(?:\?[^"'\s>]*?\bh=([0-9a-f]{6,}))?/i);
  return fromBody ? { id: fromBody[1], hash: fromBody[2] || null } : null;
}

function vimeoOembedUrl(ref) {
  const page = `https://vimeo.com/${ref.id}${ref.hash ? `/${ref.hash}` : ""}`;
  return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}`;
}

async function durationOf(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.duration === "number" && data.duration > 0 ? data.duration : null;
  } catch {
    return null;
  }
}

(async () => {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri);
  await client.connect();
  const courses = client.db("millerstorm").collection("courses");

  const docs = await courses
    .find({}, { projection: { id: 1, title: 1, "pages.id": 1, "pages.title": 1, "pages.isQuiz": 1, "pages.videoUrl": 1, "pages.body": 1, "pages.durationSeconds": 1 } })
    .toArray();

  let alreadyHadLength = 0, lengthsFound = 0, notOnVimeo = 0, vimeoDidNotAnswer = 0, written = 0;
  const misses = [];
  for (const course of docs) {
    for (const page of course.pages || []) {
      if (page.isQuiz) continue;
      if (typeof page.durationSeconds === "number" && page.durationSeconds > 0) { alreadyHadLength++; continue; }
      const ref = vimeoRefOf(page.videoUrl, page.body);
      if (!ref) { notOnVimeo++; continue; }
      const seconds = await durationOf(vimeoOembedUrl(ref));
      if (!seconds) { vimeoDidNotAnswer++; misses.push(`${course.title} | ${page.title} | ${ref.id}`); continue; }
      lengthsFound++;
      console.log(`${apply ? "SET      " : "would set"} ${String(seconds).padStart(5)}s  ${String(course.title).replace(/\s+/g, " ")} | ${page.title}`);
      if (apply) {
        const r = await courses.updateOne(
          { id: course.id },
          { $set: { "pages.$[p].durationSeconds": seconds } },
          { arrayFilters: [{ "p.id": page.id }] }
        );
        written += r.modifiedCount;
      }
    }
  }

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", alreadyHadLength, lengthsFound, notOnVimeo, vimeoDidNotAnswer, written }, null, 2));
  if (misses.length) console.log("Vimeo gave no length for:\n  " + misses.join("\n  "));
  await client.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
