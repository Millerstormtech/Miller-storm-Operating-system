// src/lib/leaderboard/others.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { otherSalesByBranch, sumOtherSales, otherSalesForScope } from "./others.ts";

const region = (loc: string) => (/lubbock|round rock|corpus/i.test(loc) ? "West Texas" : "DFW");
const profiles: Record<string, string> = { "carley@ms.com": "Fort Worth", "jeff@ms.com": "Dallas" };
const profileBranch = (email: string) => profiles[email] ?? "";

const seller = (id: string, email: string, location: string, revenue: number, won = 1) =>
  ({ repExternalId: id, email, location, lead: 0, filed: 0, won, revenue });

test("only sellers with no board row are counted, never anyone already on the board", () => {
  const out = otherSalesByBranch(
    [seller("REP", "rep@ms.com", "DFW", 50000), seller("CARLEY", "carley@ms.com", "DFW", 18350)],
    new Set(["REP"]), region, profileBranch
  );
  assert.deepEqual(out, [{ branch: "Fort Worth", lead: 0, filed: 0, won: 1, revenue: 18350 }]);
});

test("DFW sales follow the profile Branch; no profile Branch means company total only", () => {
  const out = otherSalesByBranch(
    [seller("A", "carley@ms.com", "DFW", 100), seller("B", "jeff@ms.com", "DFW", 200), seller("C", "taylor@ms.com", "DFW", 300), seller("D", "", "DFW", 400)],
    new Set(), region, profileBranch
  );
  assert.deepEqual(out.map((o) => [o.branch, o.revenue]), [["", 700], ["Dallas", 200], ["Fort Worth", 100]]);
});

test("West Texas sub-accounts are West Texas whatever the profile says", () => {
  const out = otherSalesByBranch([seller("A", "carley@ms.com", "Lubbock", 100), seller("B", "x@ms.com", "Corpus Christi", 50)], new Set(), region, profileBranch);
  assert.deepEqual(out.map((o) => [o.branch, o.revenue]), [["West Texas", 150]]);
});

test("one seller selling in two places is split between them", () => {
  const out = otherSalesByBranch([seller("A", "carley@ms.com", "DFW", 100), seller("A", "carley@ms.com", "Round Rock", 40)], new Set(), region, profileBranch);
  assert.deepEqual(out.map((o) => [o.branch, o.revenue]), [["Fort Worth", 100], ["West Texas", 40]]);
});

test("sumOtherSales: company takes everything, a branch only its own, empty set nothing", () => {
  const others = [
    { branch: "", lead: 0, filed: 1, won: 1, revenue: 700 },
    { branch: "Dallas", lead: 2, filed: 0, won: 1, revenue: 200 },
    { branch: "Fort Worth", lead: 0, filed: 0, won: 2, revenue: 100 },
  ];
  assert.deepEqual(sumOtherSales(others, null), { lead: 2, filed: 1, won: 4, revenue: 1000 });
  assert.deepEqual(sumOtherSales(others, new Set(["Dallas"])), { lead: 2, filed: 0, won: 1, revenue: 200 });
  assert.deepEqual(sumOtherSales(others, new Set(["Dallas", "Fort Worth"])).revenue, 300);
  assert.deepEqual(sumOtherSales(others, new Set()).revenue, 0);
  assert.deepEqual(sumOtherSales(others, new Set([""])).revenue, 0, "no-branch sales never count under a branch filter");
});

test("otherSalesForScope: company all, branch its own, team and self nothing", () => {
  const others = [
    { branch: "", lead: 0, filed: 0, won: 1, revenue: 700 },
    { branch: "Dallas", lead: 0, filed: 0, won: 1, revenue: 200 },
  ];
  assert.equal(otherSalesForScope(others, { level: "company" }).revenue, 900);
  assert.equal(otherSalesForScope(others, { level: "branch", branch: "Dallas" }).revenue, 200);
  assert.equal(otherSalesForScope(others, { level: "branch", branch: null }).revenue, 0);
  assert.equal(otherSalesForScope(others, { level: "team", branch: "Dallas" }).revenue, 0);
  assert.equal(otherSalesForScope(others, { level: "self" }).revenue, 0);
});
