// src/lib/leaderboard/ranking.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareStanding } from "./ranking.ts";

// compareStanding is descending ("better rep first"): a NEGATIVE result means `a`
// outranks `b`. Cascade: Contract Amount -> Contracts -> Claims Filed -> Leads
// Created -> Verified Door Knocks.
const row = (o: any) => ({ revenue: 0, won: 0, filed: 0, lead: 0, verifiedKnocks: 0, ...o });

test("Contract Amount is the primary sort", () => {
  assert.ok(compareStanding(row({ revenue: 50000 }), row({ revenue: 40000 })) < 0);
  assert.ok(compareStanding(row({ revenue: 40000 }), row({ revenue: 50000 })) > 0);
});

test("tie on Contract Amount -> more Contracts (won) wins", () => {
  const a = row({ revenue: 50000, won: 3 });
  const b = row({ revenue: 50000, won: 2 });
  assert.ok(compareStanding(a, b) < 0);
});

test("tie on Amount + Contracts -> more Claims Filed wins", () => {
  const a = row({ revenue: 50000, won: 2, filed: 9 });
  const b = row({ revenue: 50000, won: 2, filed: 4 });
  assert.ok(compareStanding(a, b) < 0);
});

test("tie on Amount + Contracts + Claims -> more Leads Created wins", () => {
  const a = row({ revenue: 50000, won: 2, filed: 4, lead: 12 });
  const b = row({ revenue: 50000, won: 2, filed: 4, lead: 7 });
  assert.ok(compareStanding(a, b) < 0);
});

test("tie on everything above -> more Verified Door Knocks wins (last resort)", () => {
  const a = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 500 });
  const b = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300 });
  assert.ok(compareStanding(a, b) < 0);
});

test("Verified Door Knocks NEVER overrides Contracts (the behavior change)", () => {
  // Same Contract Amount. `b` has far more knocks but fewer contracts. Contracts win
  // now, so `a` (more contracts) must rank first even though `b` knocked more.
  const a = row({ revenue: 50000, won: 3, verifiedKnocks: 10 });
  const b = row({ revenue: 50000, won: 2, verifiedKnocks: 999 });
  assert.ok(compareStanding(a, b) < 0);
});

test("full tie returns 0 (stable order preserved by the caller's sort)", () => {
  const a = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300 });
  const b = row({ revenue: 50000, won: 2, filed: 4, lead: 7, verifiedKnocks: 300 });
  assert.equal(compareStanding(a, b), 0);
});

test("reads leadsCreated too (client rows) not only lead (API rows)", () => {
  // The shaped client row names the field `leadsCreated`; the API MergedRow names it
  // `lead`. One function must serve both.
  const a = { revenue: 50000, won: 2, filed: 4, leadsCreated: 12, verifiedKnocks: 0 };
  const b = { revenue: 50000, won: 2, filed: 4, leadsCreated: 7, verifiedKnocks: 0 };
  assert.ok(compareStanding(a, b) < 0);
});
