// src/lib/repcard/mapping.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUserIndex, extractKnockDrafts } from "./mapping.ts";

test("buildUserIndex maps id -> {email,name,phone}", () => {
  const idx = buildUserIndex([
    { id: 150643, firstName: "Cody", lastName: "McCulley", email: "cody@ms.com", phoneNumber: "817-555-1212" },
  ]);
  const u = idx.get("150643");
  assert.equal(u?.email, "cody@ms.com");
  assert.equal(u?.name, "Cody McCulley");
  assert.equal(u?.phone, "817-555-1212");
});

test("extractKnockDrafts picks the target leaderboard + rows with vdk>0", () => {
  const result = [
    { _id: "other", leaderboard_name: "Overview", stats: { stats: [{ item_id: 1, item_title: "Nope", verified_door_knock: 99 }] } },
    { _id: "6722788eaa1c6f13b80832af", leaderboard_name: "D2D Leaderboard", stats: { stats: [
      { item_id: 200784, item_title: "Ashton Foster", verified_door_knock: 899 },
      { item_id: 162230, item_title: "Zero Rep", verified_door_knock: 0 },
    ] } },
  ];
  const drafts = extractKnockDrafts(result, { leaderboardId: "6722788eaa1c6f13b80832af", leaderboardName: "D2D Leaderboard", vdkField: "verified_door_knock" });
  assert.equal(drafts.length, 1);
  assert.deepEqual(drafts[0], { repcardUserId: "200784", name: "Ashton Foster", verifiedKnocks: 899 });
});

test("extractKnockDrafts returns [] when target leaderboard absent", () => {
  assert.deepEqual(extractKnockDrafts([], { leaderboardId: "x", leaderboardName: "y", vdkField: "verified_door_knock" }), []);
});
