// src/lib/leaderboard/merge.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLeaderboard } from "./merge.ts";

const rc = (o: any) => ({ repcardUserId: "", email: "", phone: "", nameKey: "", name: "", branch: "", verifiedKnocks: 0, ...o });
const ax = (o: any) => ({ repExternalId: "", email: "", phone: "", nameKey: "", name: "", branch: "", filed: 0, won: 0, revenue: 0, ...o });

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

test("RepCard-only rep is a knock-only row (0 deals)", () => {
  const out = mergeLeaderboard([], [rc({ repcardUserId: "r1", email: "x@ms.com", name: "X", verifiedKnocks: 10 })]);
  assert.equal(out[0].source, "repcard");
  assert.equal(out[0].verifiedKnocks, 10);
  assert.equal(out[0].revenue, 0);
});

test("AccuLynx rep with no RepCard match is its own flagged row", () => {
  const out = mergeLeaderboard([ax({ repExternalId: "a1", email: "office@ms.com", name: "Office", filed: 1 })], []);
  assert.equal(out[0].source, "acculynx");
  assert.equal(out[0].filed, 1);
});

test("phone rescues an email typo (fernado vs fernando)", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", email: "fernado.cano@ms.com", phone: "6614444131", name: "Fernado", won: 1 })],
    [rc({ repcardUserId: "r1", email: "fernando.cano@ms.com", phone: "6614444131", name: "Fernando", verifiedKnocks: 481 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "both");
  assert.equal(out[0].verifiedKnocks, 481);
  assert.equal(out[0].won, 1);
});

test("ambiguous phone (2 RepCard reps share it) does NOT merge", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", phone: "5550000000", name: "Zed", revenue: 100 })],
    [rc({ repcardUserId: "r1", phone: "5550000000", name: "One", verifiedKnocks: 1 }),
     rc({ repcardUserId: "r2", phone: "5550000000", name: "Two", verifiedKnocks: 2 })],
  );
  // 2 spine rows + 1 acculynx-only row (phone was ambiguous, no email/name match)
  assert.equal(out.length, 3);
  assert.equal(out.filter((r) => r.source === "acculynx").length, 1);
});

test("exact unique name is the last-resort match", () => {
  const out = mergeLeaderboard(
    [ax({ repExternalId: "a1", nameKey: "jane doe", name: "Jane Doe", filed: 1 })],
    [rc({ repcardUserId: "r1", nameKey: "jane doe", name: "Jane Doe", verifiedKnocks: 5 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "both");
});
