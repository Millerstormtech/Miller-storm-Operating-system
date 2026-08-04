// One-off: switch the taskTracker feature toggle ON for every active user, so
// My Tasks appears for everyone at launch. Safe to re-run.
//
// The sidebar filter is `featureToggles[toggleKey] !== false`, so an UNSET toggle
// already shows the item. This script only rescues users who were explicitly set
// to false back when the old task pages were hidden.
//
// Run AFTER the code is deployed, never before: switching the toggle on while the
// page does not exist yet puts a nav item in front of people that leads nowhere.
//
// Usage: node enable-my-tasks.js
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  const users = mongoose.connection.collection("users");

  const before = await users.countDocuments({
    deleted: { $ne: true },
    "featureToggles.taskTracker": false
  });
  console.log(`Users with taskTracker explicitly OFF: ${before}`);

  const result = await users.updateMany(
    { deleted: { $ne: true } },
    { $set: { "featureToggles.taskTracker": true } }
  );
  console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);

  const stillOff = await users.countDocuments({
    deleted: { $ne: true },
    "featureToggles.taskTracker": false
  });
  console.log(`Users still OFF after the update: ${stillOff} (expected 0)`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
