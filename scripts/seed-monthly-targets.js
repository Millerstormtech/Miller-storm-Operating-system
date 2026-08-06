// One-time migration: backfill businessPlan.monthlyRevenueTarget from the
// legacy annual businessPlan.revenueGoal, for users who set the old field but
// never saw the new one. Idempotent, safe to run repeatedly. Usage:
//   node scripts/seed-monthly-targets.js          (report only, writes nothing)
//   node scripts/seed-monthly-targets.js --apply  (writes)
//
// Knock and claim targets are deliberately NOT seeded here. No existing field
// means the same thing as monthlyKnockTarget/monthlyClaimsTarget, and
// inventing one would violate the "no inferred targets" rule: a person must
// never be measured against a number they did not choose.
require("dotenv").config();
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

// Seeding rule: Math.round(revenueGoal / 12), nothing for a non-positive
// goal. This is a deliberate mirror of monthlyFromLegacy in
// src/lib/scoreboard/goals.ts (that is a TypeScript ESM module; this is a
// plain CommonJS script and cannot import it). Keep the two in agreement if
// the rule ever changes.
function monthlyFromLegacy(revenueGoal) {
  if (!revenueGoal || revenueGoal <= 0) return null;
  return Math.round(revenueGoal / 12);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.collection("users");

  // Only users with a positive legacy annual goal and no monthly target yet.
  //
  // "$exists: false" on purpose, not a falsy/null check. In Mongo, matching
  // { field: null } also matches documents where the field is explicitly set
  // to null, which is a different thing from the field never having been
  // set: a rep who saved the new My Goals form and explicitly cleared their
  // target made a choice, and this script must not overwrite that choice.
  // "Absent" means the key genuinely does not exist on the subdocument.
  //
  // Soft-deleted accounts are excluded (deleted: { $ne: true }), matching the
  // convention already used elsewhere for this exact collection (see
  // pages/api/leaderboard.ts and the bulk-listing branch of
  // pages/api/business-plan.ts).
  //
  // Suspended accounts are deliberately KEPT (no suspended filter). The
  // bulk-listing branch of pages/api/business-plan.ts itself only filters
  // `deleted`, not `suspended`, so a suspended rep's business plan is still
  // live roster data there. Seeding it now means a rep who is later
  // un-suspended does not come back to an empty My Goals screen.
  const query = {
    "businessPlan.revenueGoal": { $gt: 0 },
    "businessPlan.monthlyRevenueTarget": { $exists: false },
    deleted: { $ne: true }
  };

  const candidates = await users.find(query).toArray();

  let changed = 0;
  for (const u of candidates) {
    const revenueGoal = u.businessPlan && u.businessPlan.revenueGoal;
    const monthly = monthlyFromLegacy(revenueGoal);
    if (monthly == null) continue; // defensive; the query already guarantees > 0

    const label = `${u.name || "(no name)"} <${u.email || "no email"}>`;
    console.log(`   ${label}: monthlyRevenueTarget unset -> ${monthly} (from revenueGoal ${revenueGoal} / 12)`);
    changed++;

    if (APPLY) {
      // Targeted single-field $set via dot path. Never $set the whole
      // businessPlan object: that is a read-modify-write over a stale
      // in-memory snapshot, and would clobber any concurrent edit to the
      // rest of the plan (a bug this repo has already shipped once and had
      // to fix). Only this one field is touched.
      await users.updateOne(
        { _id: u._id },
        { $set: { "businessPlan.monthlyRevenueTarget": monthly } }
      );
    }
  }

  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} - ${changed}/${candidates.length} users updated`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
