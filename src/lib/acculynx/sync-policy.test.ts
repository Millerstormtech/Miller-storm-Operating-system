// src/lib/acculynx/sync-policy.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSyncMode, backfillNeeded } from "./sync-policy.ts";

test("backfillNeeded: stored below code version -> true", () => {
  assert.equal(backfillNeeded(0, 1), true);
  assert.equal(backfillNeeded(1, 2), true);
});

test("backfillNeeded: null/undefined stored version reads as 0 -> true when code > 0", () => {
  assert.equal(backfillNeeded(null, 1), true);
  assert.equal(backfillNeeded(undefined, 1), true);
});

test("backfillNeeded: equal versions -> false", () => {
  assert.equal(backfillNeeded(1, 1), false);
});

test("backfillNeeded: stored ABOVE code (a rollback) -> false", () => {
  assert.equal(backfillNeeded(2, 1), false);
});

test("resolveSyncMode: explicit backfill always wins, even when versions match", () => {
  assert.equal(
    resolveSyncMode({ requestedMode: "backfill", storedVersion: 5, codeVersion: 5, dryRun: false }),
    "backfill",
  );
});

test("resolveSyncMode: explicit backfill wins even in dryRun", () => {
  assert.equal(
    resolveSyncMode({ requestedMode: "backfill", storedVersion: 5, codeVersion: 5, dryRun: true }),
    "backfill",
  );
});

test("resolveSyncMode: incremental with equal versions stays incremental", () => {
  assert.equal(
    resolveSyncMode({ requestedMode: "incremental", storedVersion: 1, codeVersion: 1, dryRun: false }),
    "incremental",
  );
});

test("resolveSyncMode: incremental with a version gap upgrades to a backfill (migration)", () => {
  assert.equal(
    resolveSyncMode({ requestedMode: "incremental", storedVersion: 0, codeVersion: 1, dryRun: false }),
    "backfill",
  );
});

test("resolveSyncMode: never-backfilled location (null stored) upgrades to a backfill", () => {
  assert.equal(
    resolveSyncMode({ requestedMode: "incremental", storedVersion: null, codeVersion: 1, dryRun: false }),
    "backfill",
  );
});

test("resolveSyncMode: dryRun never upgrades an incremental (a smoke test stays bounded)", () => {
  assert.equal(
    resolveSyncMode({ requestedMode: "incremental", storedVersion: 0, codeVersion: 1, dryRun: true }),
    "incremental",
  );
});

test("resolveSyncMode: incremental with stored ABOVE code (rollback) stays incremental", () => {
  assert.equal(
    resolveSyncMode({ requestedMode: "incremental", storedVersion: 2, codeVersion: 1, dryRun: false }),
    "incremental",
  );
});
