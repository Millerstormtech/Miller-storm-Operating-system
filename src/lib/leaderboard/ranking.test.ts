// src/lib/leaderboard/ranking.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareStanding } from "./ranking.ts";

// compareStanding is descending ("better rep first"): a NEGATIVE result means `a`
// outranks `b`. Cascade: Contract Amount -> Contracts -> Claims Filed -> Leads
// Created -> Verified Door Knocks -> Name (alphabetical, case-insensitive) -> id
// (final, guaranteed-unique fallback for two reps who happen to share a name).
const row = (o: any) => ({ revenue: 0, won: 0, filed: 0, lead: 0, verifiedKnocks: 0, name: "", id: "", ...o });

test("Contract Amount is the primary sort", () => {
  // Names deliberately reversed alphabetically from the revenue order, so a
  // regression that let the tie-break leak into non-tied rows would be caught.
  assert.ok(compareStanding(row({ revenue: 50000, name: "Zack" }), row({ revenue: 40000, name: "Amy" })) < 0);
  assert.ok(compareStanding(row({ revenue: 40000, name: "Amy" }), row({ revenue: 50000, name: "Zack" })) > 0);
});

test("tie on Contract Amount -> more Contracts (won) wins", () => {
  const a = row({ revenue: 50000, won: 3, name: "Zack" });
  const b = row({ revenue: 50000, won: 2, name: "Amy" });
  assert.ok(compareStanding(a, b) < 0);
});

test("tie on Amount + Contracts -> more Claims Filed wins", () => {
  const a = row({ revenue: 50000, won: 2, filed: 9, name: "Zack" });
  const b = row({ revenue: 50000, won: 2, filed: 4, name: "Amy" });
  assert.ok(compareStanding(a, b) < 0);
});

test("tie on Amount + Contracts + Claims -> more Leads Created wins", () => {
  const a = row({ revenue: 50000, won: 2, filed: 4, lead: 12, name: "Zack" });
  const b = row({ revenue: 50000, won: 2, filed: 4, lead: 7, name: "Amy" });
  assert.ok(compareStanding(a, b) < 0);
});

test("tie on everything above -> more Verified Door Knocks wins (last real signal)", () => {
  // `a` sorts AFTER `b` alphabetically, so if the new name tie-break ever fired
  // before knocks, this would flip and the test would fail.
  const a = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 500, name: "Zack" });
  const b = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300, name: "Amy" });
  assert.ok(compareStanding(a, b) < 0);
});

test("Verified Door Knocks NEVER overrides Contracts (the behavior change)", () => {
  // Same Contract Amount. `b` has far more knocks but fewer contracts. Contracts win
  // now, so `a` (more contracts) must rank first even though `b` knocked more.
  const a = row({ revenue: 50000, won: 3, verifiedKnocks: 10 });
  const b = row({ revenue: 50000, won: 2, verifiedKnocks: 999 });
  assert.ok(compareStanding(a, b) < 0);
});

test("reads leadsCreated too (client rows) not only lead (API rows)", () => {
  // The shaped client row names the field `leadsCreated`; the API MergedRow names it
  // `lead`. One function must serve both.
  const a = { revenue: 50000, won: 2, filed: 4, leadsCreated: 12, verifiedKnocks: 0 };
  const b = { revenue: 50000, won: 2, filed: 4, leadsCreated: 7, verifiedKnocks: 0 };
  assert.ok(compareStanding(a, b) < 0);
});

// --- Determinism (the bug fix) -------------------------------------------
//
// Root cause being fixed: two rows tied on every real signal used to compare
// as 0, and Array.prototype.sort's stability then just preserved whatever
// order MongoDB happened to hand back that request -- which is unordered
// among ties. A rep could refresh and see themselves swap places with a tied
// rep for no data reason at all.

test("full tie on every real signal now breaks deterministically by name (alphabetical)", () => {
  const alice = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300, name: "Alice", id: "rc:2" });
  const bob = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300, name: "Bob", id: "rc:1" });
  // Alice sorts first: alphabetical, not the id (rc:2 > rc:1 would say otherwise).
  assert.ok(compareStanding(alice, bob) < 0);
  assert.ok(compareStanding(bob, alice) > 0);
});

test("tied rows sort the SAME way regardless of which input order they arrive in", () => {
  // This is the test that actually proves the fix: it feeds the exact same two
  // rows in both possible input orders through a real Array.prototype.sort and
  // asserts the OUTPUT order is identical either way. Before the fix, sort's
  // stability meant the output order just mirrored the input order (0 for a
  // full tie), so this assertion would have failed for one of the two calls.
  const alice = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300, name: "Alice", id: "rc:2" });
  const bob = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300, name: "Bob", id: "rc:1" });

  const sortedAliceFirst = [alice, bob].sort(compareStanding).map((r) => r.name);
  const sortedBobFirst = [bob, alice].sort(compareStanding).map((r) => r.name);

  assert.deepEqual(sortedAliceFirst, ["Alice", "Bob"]);
  assert.deepEqual(sortedBobFirst, ["Alice", "Bob"]);
});

test("name tie-break is case-insensitive", () => {
  const a = row({ name: "alice", id: "rc:1" });
  const b = row({ name: "Bob", id: "rc:2" });
  assert.ok(compareStanding(a, b) < 0);
  assert.ok(compareStanding(b, a) > 0);
});

test("two rows tied on every real signal AND on name break by id (the absolute-uniqueness fallback)", () => {
  const a = row({ name: "John Smith", id: "rc:100" });
  const b = row({ name: "John Smith", id: "rc:200" });
  assert.ok(compareStanding(a, b) < 0);
  assert.ok(compareStanding(b, a) > 0);
});

test("a fully-tied row still compares equal to an identical copy of itself (0 is correct, not just any non-zero)", () => {
  const a = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300, name: "Alice", id: "rc:1" });
  const b = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300, name: "Alice", id: "rc:1" });
  assert.equal(compareStanding(a, b), 0);
});
