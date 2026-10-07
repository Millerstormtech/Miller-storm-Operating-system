// src/lib/repcard/branches.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { saleRegion } from "./branches.ts";

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
