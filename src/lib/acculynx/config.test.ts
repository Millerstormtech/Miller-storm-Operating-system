// src/lib/acculynx/config.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getLocationKeys, cleanBranchName } from "./config.ts";

test("cleanBranchName strips the AccuLynx company prefix", () => {
  assert.equal(cleanBranchName("MSR - Lubbock"), "Lubbock");
  assert.equal(cleanBranchName("Miller Storm Roofing and Reconstruction - DFW"), "DFW");
  assert.equal(cleanBranchName("MSR - Corpus Christi"), "Corpus Christi");
  assert.equal(cleanBranchName("SoloName"), "SoloName"); // no separator -> as-is
  assert.equal(cleanBranchName(""), "Unknown");
});

test("getLocationKeys collects ACCULYNX_API_KEY_* (+ bare) and skips placeholders", () => {
  const env = {
    ACCULYNX_API_KEY_LUBBOCK: "key-lub",
    ACCULYNX_API_KEY_DFW: "PASTE_DFW_KEY_HERE", // unfilled placeholder -> skipped
    ACCULYNX_API_KEY: "key-bare",               // back-compat bare key -> included
    ACCULYNX_SYNC_SECRET: "not-a-key",          // different var -> ignored
    UNRELATED: "x",
  };
  const got = getLocationKeys(env).map((l) => l.envVar).sort();
  assert.deepEqual(got, ["ACCULYNX_API_KEY", "ACCULYNX_API_KEY_LUBBOCK"]);
});
