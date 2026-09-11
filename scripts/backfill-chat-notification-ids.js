#!/usr/bin/env node
/**
 * One-off repair for Storm Chat notifications written under a Mongo _id.
 *
 * Until 2026-09-10 every stormchat_message / stormchat_mention Notification
 * was created with userId = the member's Mongo _id, while the bell and the
 * phone read notifications by the app id in the session (User.id, e.g.
 * "user-1712345678"). Those rows could never be seen: 17,694 of them, all
 * unread, at the time of the fix.
 *
 * This script rewrites userId to the matching app id AND marks the row read.
 * Marking read is deliberate: they are days-to-months old, the chat itself
 * already shows the messages, and surfacing thousands of stale "new message"
 * rows in everyone's bell at once would be worse than the bug. Rows whose
 * Mongo _id no longer matches a user are deleted (the user is gone).
 *
 * Usage (from the repo root, with MONGODB_URI in .env or the environment):
 *   node scripts/backfill-chat-notification-ids.js            # dry run, counts only
 *   node scripts/backfill-chat-notification-ids.js --apply    # write the changes
 */
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

function loadEnv() {
  const p = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

(async () => {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("millerstorm");
  const notifications = db.collection("notifications");
  const users = db.collection("users");

  const HEX24 = /^[0-9a-f]{24}$/i;
  const cursor = notifications.find(
    { type: { $in: ["stormchat_message", "stormchat_mention"] } },
    { projection: { _id: 1, userId: 1 } }
  );

  const byMongo = new Map();
  for (const u of await users.find({}, { projection: { _id: 1, id: 1 } }).toArray()) {
    byMongo.set(String(u._id), u.id);
  }

  let scanned = 0, alreadyAppId = 0, toRewrite = 0, orphaned = 0;
  const ops = [];
  for await (const n of cursor) {
    scanned++;
    const uid = String(n.userId || "");
    if (!HEX24.test(uid)) { alreadyAppId++; continue; }
    const appId = byMongo.get(uid);
    if (!appId) {
      orphaned++;
      if (apply) ops.push({ deleteOne: { filter: { _id: n._id } } });
      continue;
    }
    toRewrite++;
    if (apply) ops.push({ updateOne: { filter: { _id: n._id }, update: { $set: { userId: appId, read: true } } } });
  }

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", scanned, alreadyAppId, toRewrite, orphaned }, null, 2));

  if (apply && ops.length) {
    let done = 0;
    for (let i = 0; i < ops.length; i += 1000) {
      const r = await notifications.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
      done += (r.modifiedCount || 0) + (r.deletedCount || 0);
    }
    console.log(`applied ${done} changes`);
  }
  await client.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
