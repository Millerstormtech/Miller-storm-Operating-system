// VITEST, not node:test — registered individually in vitest.config.ts.
// (This folder is mixed; a file listed in neither runner runs NOWHERE.)
import { describe, it, expect } from "vitest";
import { isDeletedFromRepCard } from "./roster";

describe("isDeletedFromRepCard", () => {
  const directory = new Set(["100", "200", "300"]);

  it("keeps a rep who has a directory row", () => {
    expect(isDeletedFromRepCard("200", directory)).toBe(false);
  });

  it("removes a rep with knock history but no directory row", () => {
    // The real cases: Austin Apple (185742) and Richard Browder (177505), both
    // deleted from RepCard rather than deactivated, so they carried no status
    // and could never be marked or hidden.
    expect(isDeletedFromRepCard("185742", directory)).toBe(true);
    expect(isDeletedFromRepCard("177505", directory)).toBe(true);
  });

  it("SAFETY VALVE: an empty directory removes NOBODY", () => {
    // An empty mirror means the RepCard user sync has never succeeded, not that
    // the whole company was deleted. Without this, a fresh or restored database
    // would silently render an empty leaderboard.
    const empty = new Set<string>();
    expect(isDeletedFromRepCard("185742", empty)).toBe(false);
    expect(isDeletedFromRepCard("anyone-at-all", empty)).toBe(false);
  });

  it("a one-row directory still removes everyone else (the valve is empty-only)", () => {
    // Deliberately NOT a "looks too small" heuristic. The mirror is upsert-only,
    // so a small directory is a small company, not a broken sync. Guessing a
    // threshold would fail silently in the other direction.
    const tiny = new Set(["100"]);
    expect(isDeletedFromRepCard("100", tiny)).toBe(false);
    expect(isDeletedFromRepCard("200", tiny)).toBe(true);
  });

  it("matches ids exactly, with no numeric coercion", () => {
    // repcardUserId is carried as a string everywhere (String(r._id) in
    // compute.ts). A loose compare here would be a silent identity bug.
    expect(isDeletedFromRepCard("0100", directory)).toBe(true);
    expect(isDeletedFromRepCard("100 ", directory)).toBe(true);
  });
});
