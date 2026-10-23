// VITEST, not node:test — registered individually in vitest.config.ts.
// (This folder is mixed; a file listed in neither runner runs NOWHERE.)
import { describe, it, expect } from "vitest";
import { isDeletedFromRepCard, formerRepsWithActivity } from "./roster";

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

describe("formerRepsWithActivity (former reps with sales but no knocks)", () => {
  const acx = (id: string, email: string, phone: string, over: Partial<{ lead: number; filed: number; won: number; revenue: number; nameKey: string }> = {}) => ({
    repExternalId: id, email, phone, nameKey: over.nameKey ?? "", name: id, branch: "",
    lead: over.lead ?? 0, filed: over.filed ?? 0, won: over.won ?? 0, revenue: over.revenue ?? 0,
  });
  const rc = (id: string, email: string, phone = "") => ({ repcardUserId: id, email, phone, nameKey: "", name: id, branch: "", verifiedKnocks: 5 });
  const roster = [rc("1", "kelvin@ms.com", "8170000001")];
  const chris = { repcardUserId: "168342", email: "chris.harwood@ms.com", phone: "8067864679", status: "DEACTIVATE", team: "Lubbock Team" };

  it("adds a deactivated rep whose AccuLynx sales match by email (Chris Harwood)", () => {
    const sales = [acx("ACX-CH", "chris.harwood@ms.com", "", { won: 2, revenue: 31623.76 })];
    expect(formerRepsWithActivity(sales, roster, [chris])).toEqual(["168342"]);
  });

  it("matches by phone when the emails differ", () => {
    const sales = [acx("ACX-CH", "chris@other.com", "8067864679", { filed: 1 })];
    expect(formerRepsWithActivity(sales, roster, [chris])).toEqual(["168342"]);
  });

  it("any activity counts: a lead alone earns the row", () => {
    expect(formerRepsWithActivity([acx("ACX-CH", "chris.harwood@ms.com", "", { lead: 1 })], roster, [chris])).toEqual(["168342"]);
  });

  it("no activity in the period, no row", () => {
    expect(formerRepsWithActivity([acx("ACX-CH", "chris.harwood@ms.com", "")], roster, [chris])).toEqual([]);
  });

  it("leaves out RepCard's Management team (owners stay in the totals only)", () => {
    const taylor = { repcardUserId: "9", email: "taylor@ms.com", phone: "", status: "DEACTIVATE", team: "Management" };
    expect(formerRepsWithActivity([acx("ACX-T", "taylor@ms.com", "", { revenue: 1095.04, won: 1 })], roster, [taylor])).toEqual([]);
  });

  it("leaves out ACTIVE RepCard users who never knocked", () => {
    const active = { ...chris, status: "ACTIVE" };
    expect(formerRepsWithActivity([acx("ACX-CH", "chris.harwood@ms.com", "", { won: 1 })], roster, [active])).toEqual([]);
  });

  it("never by name alone", () => {
    const sales = [acx("ACX-CH", "", "", { won: 1, nameKey: "chris harwood" })];
    expect(formerRepsWithActivity(sales, roster, [chris])).toEqual([]);
  });

  it("credit that already lands on a roster rep adds nobody", () => {
    const sales = [acx("ACX-K", "kelvin@ms.com", "", { won: 3 })];
    const oldKelvin = { repcardUserId: "77", email: "kelvin@ms.com", phone: "", status: "DEACTIVATE", team: "Lubbock Team" };
    expect(formerRepsWithActivity(sales, roster, [oldKelvin])).toEqual([]);
  });

  it("a former account sharing a roster rep's phone is skipped, so the rep keeps their match", () => {
    const rehire = { repcardUserId: "78", email: "kelvin.old@ms.com", phone: "8170000001", status: "DEACTIVATE", team: "Lubbock Team" };
    expect(formerRepsWithActivity([acx("ACX-X", "kelvin.old@ms.com", "", { won: 1 })], roster, [rehire])).toEqual([]);
  });

  it("someone already on the roster is not added twice", () => {
    const onBoard = { repcardUserId: "1", email: "x@ms.com", phone: "", status: "DEACTIVATE", team: "T" };
    expect(formerRepsWithActivity([acx("ACX-X", "x@ms.com", "", { won: 1 })], roster, [onBoard])).toEqual([]);
  });

  it("two former accounts with the same email are ambiguous: neither is added", () => {
    const a = { ...chris, repcardUserId: "500" }, b = { ...chris, repcardUserId: "501" };
    expect(formerRepsWithActivity([acx("ACX-CH", "chris.harwood@ms.com", "", { won: 1 })], roster, [a, b])).toEqual([]);
  });
});
