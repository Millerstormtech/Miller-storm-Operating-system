// src/lib/acculynx/sweep.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { planDeletedJobPurge } from "./sweep.ts";

test("nothing missing -> nothing to remove", () => {
  assert.deepEqual(planDeletedJobPurge({ checked: 700, missing: [] }), { purge: [], refused: false });
});

test("a few deleted jobs are removed", () => {
  const plan = planDeletedJobPurge({ checked: 700, missing: ["J1", "J2"] });
  assert.deepEqual(plan.purge, ["J1", "J2"]);
  assert.equal(plan.refused, false);
});

test("up to 5 missing is always fine, even on a small location", () => {
  const plan = planDeletedJobPurge({ checked: 8, missing: ["a", "b", "c", "d", "e"] });
  assert.equal(plan.refused, false);
  assert.equal(plan.purge.length, 5);
});

test("most jobs missing looks like a bad API key: remove nothing", () => {
  const missing = Array.from({ length: 60 }, (_, i) => `J${i}`);
  const plan = planDeletedJobPurge({ checked: 61, missing });
  assert.equal(plan.refused, true);
  assert.deepEqual(plan.purge, []);
  assert.match(plan.reason ?? "", /60 of 61/);
});

test("just over the share and over 5 is refused; at the share it is allowed", () => {
  assert.equal(planDeletedJobPurge({ checked: 60, missing: Array.from({ length: 6 }, (_, i) => `J${i}`) }).refused, false); // 6 = 10%
  assert.equal(planDeletedJobPurge({ checked: 59, missing: Array.from({ length: 6 }, (_, i) => `J${i}`) }).refused, true);  // 6 > 10%
});
