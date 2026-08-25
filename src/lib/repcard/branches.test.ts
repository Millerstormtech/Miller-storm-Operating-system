// src/lib/repcard/branches.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { saleRegion, attributeToBranch, BRANCHES } from "./branches.ts";

test("West Texas sub-accounts roll up to West Texas", () => {
  assert.equal(saleRegion("Lubbock"), "West Texas");
  assert.equal(saleRegion("Round Rock"), "West Texas");
  assert.equal(saleRegion("Corpus Christi"), "West Texas");
});

test("Commercial sub-account -> Commercial", () => {
  assert.equal(saleRegion("Commercial"), "Commercial");
});

test("DFW (and anything else/unknown) -> DFW (caller resolves to home branch)", () => {
  assert.equal(saleRegion("DFW"), "DFW");
  assert.equal(saleRegion("Fort Worth"), "DFW");
  assert.equal(saleRegion("Dallas"), "DFW");
  assert.equal(saleRegion(""), "DFW");
  assert.equal(saleRegion(null), "DFW");
});

// --- Team-based branch attribution (decided 2026-08-12, confirmed 2026-08-21) ---

const T = { verifiedKnocks: 5, leadsCreated: 4, filed: 3, won: 2, revenue: 100000 };

test("all of a rep's numbers land on their home branch", () => {
  assert.deepEqual(attributeToBranch("Fort Worth", T), { "Fort Worth": T });
});

test("storm-chase sales do NOT split out to the branch they were filed in", () => {
  // Team-based: a Fort Worth rep selling in West Texas still reports to Fort Worth.
  const out = attributeToBranch("Fort Worth", T);
  assert.equal(Object.keys(out).length, 1);
  assert.equal(out["West Texas"], undefined);
});

test("a rep with no resolvable branch lands under no branch", () => {
  assert.deepEqual(attributeToBranch("", T), {});
  assert.deepEqual(attributeToBranch(null, T), {});
  assert.deepEqual(attributeToBranch(undefined, T), {});
});

test("returns a copy, so a caller cannot mutate the source totals", () => {
  const src = { ...T };
  const out = attributeToBranch("Dallas", src);
  out["Dallas"].revenue = 1;
  assert.equal(src.revenue, 100000);
});

test("every real branch is supported, Commercial included", () => {
  for (const b of [...BRANCHES, "Commercial"]) {
    assert.deepEqual(attributeToBranch(b, T), { [b]: T });
  }
});
