/**
 * One-time migration: rename the role KEY "manager" -> "sales-team-lead".
 *
 * This ONLY changes the stored role value; it does not touch the separate
 * "branch-manager" role. Run this AT DEPLOY TIME, together with the code that
 * expects the new "sales-team-lead" key — running it long before/after the
 * deploy leaves the DB and code temporarily out of sync.
 *
 * Existing signed-in managers carry role="manager" inside their 7-day session
 * token, so after this migration they must log in again once to receive a fresh
 * token with role="sales-team-lead". Login uses email/password (not role), so
 * they can re-login normally.
 *
 * Usage:
 *   MONGODB_URI="<prod uri>" node migrate-manager-to-sales-team-lead.js
 *   (or rely on .env via dotenv if installed)
 *   Add --dry to preview counts without writing:
 *   MONGODB_URI="..." node migrate-manager-to-sales-team-lead.js --dry
 */
try { require("dotenv").config(); } catch (_) { /* dotenv optional */ }

const mongoose = require("mongoose");

const OLD_ROLE = "manager";
const NEW_ROLE = "sales-team-lead";
const DRY_RUN = process.argv.includes("--dry");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";

const AnyDoc = new mongoose.Schema({}, { strict: false });

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: "millerstorm" });
  console.log(`Connected. ${DRY_RUN ? "[DRY RUN — no writes]" : "[LIVE — will write]"}\n`);

  const Users = mongoose.connection.collection("users");
  const Requests = mongoose.connection.collection("userrequests");

  // 1) users.role == "manager"
  const usersByRole = await Users.countDocuments({ role: OLD_ROLE });
  // 2) users.roles array contains "manager"
  const usersByRolesArray = await Users.countDocuments({ roles: OLD_ROLE });
  // 3) pending registration requests with role "manager"
  let requestsCount = 0;
  try { requestsCount = await Requests.countDocuments({ role: OLD_ROLE }); } catch (_) {}

  console.log(`users.role == "${OLD_ROLE}":         ${usersByRole}`);
  console.log(`users.roles[] contains "${OLD_ROLE}": ${usersByRolesArray}`);
  console.log(`userrequests.role == "${OLD_ROLE}":   ${requestsCount}\n`);

  if (DRY_RUN) {
    console.log("Dry run complete — no changes written.");
    await mongoose.disconnect();
    return;
  }

  // Primary role field
  const r1 = await Users.updateMany({ role: OLD_ROLE }, { $set: { role: NEW_ROLE } });
  console.log(`Updated users.role: ${r1.modifiedCount}`);

  // roles[] array element (positional update for every matching element)
  const r2 = await Users.updateMany(
    { roles: OLD_ROLE },
    { $set: { "roles.$[el]": NEW_ROLE } },
    { arrayFilters: [{ el: OLD_ROLE }] }
  );
  console.log(`Updated users.roles[]: ${r2.modifiedCount}`);

  // Pending registration requests
  try {
    const r3 = await Requests.updateMany({ role: OLD_ROLE }, { $set: { role: NEW_ROLE } });
    console.log(`Updated userrequests.role: ${r3.modifiedCount}`);
  } catch (_) { console.log("userrequests collection not present — skipped"); }

  // Sanity: nothing left
  const leftover = await Users.countDocuments({ role: OLD_ROLE });
  console.log(`\nRemaining users.role == "${OLD_ROLE}": ${leftover} (should be 0)`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((e) => { console.error(e); process.exit(1); });
