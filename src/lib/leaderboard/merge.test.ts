// src/lib/leaderboard/merge.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLeaderboard } from "./merge.ts";

const rc = (o: any) => ({ repcardUserId: "", email: "", phone: "", nameKey: "", name: "", branch: "", verifiedKnocks: 0, ...o });
const ax = (o: any) => ({ repExternalId: "", email: "", phone: "", nameKey: "", name: "", branch: "", lead: 0, filed: 0, won: 0, revenue: 0, ...o });

test("email match merges knocks + deals into one 'both' row", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", email: "alan@ms.com", name: "Alan", won: 2, revenue: 50000 })],
    [rc({ repcardUserId: "r1", email: "alan@ms.com", name: "Alan", verifiedKnocks: 300 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "both");
  assert.equal(out[0].verifiedKnocks, 300);
  assert.equal(out[0].revenue, 50000);
});

test("lead count merges onto the matched row like filed", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", email: "alan@ms.com", name: "Alan", lead: 7, filed: 3 })],
    [rc({ repcardUserId: "r1", email: "alan@ms.com", name: "Alan", verifiedKnocks: 10 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].lead, 7);
  assert.equal(out[0].filed, 3);
});

test("RepCard rep with no matching deals is a knock-only 'repcard' row", () => {
  const out = mergeLeaderboard([], [rc({ repcardUserId: "r1", email: "x@ms.com", name: "X", verifiedKnocks: 10 })]);
  assert.equal(out[0].source, "repcard");
  assert.equal(out[0].verifiedKnocks, 10);
  assert.equal(out[0].revenue, 0);
});

test("idle roster rep with 0 verified knocks is STILL returned as a zero row", () => {
  // The gate moved to the caller; merge must not drop idle reps.
  const out = mergeLeaderboard([], [rc({ repcardUserId: "r1", email: "idle@ms.com", name: "Idle", verifiedKnocks: 0 })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].verifiedKnocks, 0);
  assert.equal(out[0].source, "repcard");
});

test("AccuLynx credit with no RepCard match is dropped entirely (no extra row)", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", email: "office@ms.com", name: "Office", filed: 1 })],
    [rc({ repcardUserId: "r1", email: "real@ms.com", name: "Real", verifiedKnocks: 1 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "rc:r1");
  assert.equal(out[0].filed, 0);
});

test("phone rescues an email typo (fernado vs fernando)", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", email: "fernado.cano@ms.com", phone: "6614444131", name: "Fernado", won: 1 })],
    [rc({ repcardUserId: "r1", email: "fernando.cano@ms.com", phone: "6614444131", name: "Fernando", verifiedKnocks: 481 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "both");
  assert.equal(out[0].won, 1);
});

test("ambiguous phone (2 RepCard reps share it) does NOT merge and adds no row", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", phone: "5550000000", name: "Zed", revenue: 100 })],
    [rc({ repcardUserId: "r1", phone: "5550000000", name: "One", verifiedKnocks: 1 }),
     rc({ repcardUserId: "r2", phone: "5550000000", name: "Two", verifiedKnocks: 2 })],
  );
  assert.equal(out.length, 2); // only the 2 spine rows; the unmatched acx is dropped
  assert.ok(out.every((r) => r.source === "repcard"));
  assert.ok(out.every((r) => r.revenue === 0));
});

test("exact unique name is the last-resort match", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", nameKey: "jane doe", name: "Jane Doe", filed: 1 })],
    [rc({ repcardUserId: "r1", nameKey: "jane doe", name: "Jane Doe", verifiedKnocks: 5 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "both");
});
