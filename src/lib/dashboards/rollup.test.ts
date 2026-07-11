// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/dashboards/rollup.test.ts
// Note: imports use an explicit ".ts" extension because Node's built-in test runner
// resolves ES modules literally (unlike Next.js/tsc). Source files stay extensionless.
import { test } from "node:test";
import assert from "node:assert";
import { sumMetrics, buildTree, subtreeIds, rollupFor } from "./rollup.ts";

test("sumMetrics adds the four metrics", () => {
  const r = sumMetrics([
    { id: "a", verifiedKnocks: 10, filed: 2, won: 1, revenue: 1000 },
    { id: "b", verifiedKnocks: 5, filed: 1, won: 1, revenue: 2000 },
  ] as any);
  assert.deepStrictEqual(r, { verifiedKnocks: 15, filed: 3, won: 2, revenue: 3000 });
});

test("subtreeIds returns root plus all descendants", () => {
  const people = [
    { id: "bm", managerId: "" }, { id: "tl", managerId: "bm" },
    { id: "r1", managerId: "tl" }, { id: "r2", managerId: "tl" },
  ] as any;
  const ids = subtreeIds("bm", buildTree(people)).sort();
  assert.deepStrictEqual(ids, ["bm", "r1", "r2", "tl"]);
});

// A two-branch synthetic org used to exercise every rollup slice.
//   bm  (branch mgr) ── tl (team lead) ── r1, r2 (reps)
//                    └─ d1 (rep the BM runs directly)
//   bm2 (branch mgr) ── r3 (rep)
//   ceo (c-level, nobody under them)
const PEOPLE = [
  { id: "bm", name: "BM", role: "branch_manager", managerId: "" },
  { id: "tl", name: "TL", role: "team_lead", managerId: "bm" },
  { id: "r1", name: "R1", role: "sales_rep", managerId: "tl" },
  { id: "r2", name: "R2", role: "sales_rep", managerId: "tl" },
  { id: "d1", name: "D1", role: "sales_rep", managerId: "bm" },
  { id: "bm2", name: "BM2", role: "branch_manager", managerId: "" },
  { id: "r3", name: "R3", role: "sales_rep", managerId: "bm2" },
  { id: "ceo", name: "CEO", role: "c_level", managerId: "" },
] as any;
// Distinct powers-of-two knock values make every sum uniquely decodable.
const REPS = [
  { id: "r1", verifiedKnocks: 1, filed: 1, won: 1, revenue: 100 },
  { id: "r2", verifiedKnocks: 2, filed: 2, won: 2, revenue: 200 },
  { id: "d1", verifiedKnocks: 4, filed: 0, won: 0, revenue: 400 },
  { id: "tl", verifiedKnocks: 16, filed: 0, won: 0, revenue: 1600 },
  { id: "bm", verifiedKnocks: 32, filed: 0, won: 0, revenue: 3200 },
  { id: "r3", verifiedKnocks: 8, filed: 0, won: 0, revenue: 800 },
] as any;

test("rollupFor: a team lead's team = self + their reps", () => {
  const { self, team } = rollupFor("tl", PEOPLE, REPS);
  assert.deepStrictEqual(self, { verifiedKnocks: 16, filed: 0, won: 0, revenue: 1600 });
  assert.deepStrictEqual(team, { verifiedKnocks: 19, filed: 3, won: 3, revenue: 1900 }); // tl+r1+r2
});

test("rollupFor: a branch manager's team is only their DIRECT reps, not sub-teams", () => {
  const { team } = rollupFor("bm", PEOPLE, REPS);
  assert.deepStrictEqual(team, { verifiedKnocks: 36, filed: 0, won: 0, revenue: 3600 }); // bm+d1 only
});

test("rollupFor: a branch manager's branch = their whole subtree", () => {
  const { branch } = rollupFor("bm", PEOPLE, REPS);
  assert.deepStrictEqual(branch, { verifiedKnocks: 55, filed: 3, won: 3, revenue: 5500 }); // bm+tl+r1+r2+d1
});

test("rollupFor: a rep inherits its branch ancestor's subtree as 'branch'", () => {
  const { branch } = rollupFor("r1", PEOPLE, REPS);
  assert.deepStrictEqual(branch, { verifiedKnocks: 55, filed: 3, won: 3, revenue: 5500 });
});

test("rollupFor: company = every rep across all branches", () => {
  const { company } = rollupFor("bm", PEOPLE, REPS);
  assert.deepStrictEqual(company, { verifiedKnocks: 63, filed: 3, won: 3, revenue: 6300 });
});

test("rollupFor: a C-level with no branch ancestor falls back to company for 'branch'", () => {
  const { branch, company, team } = rollupFor("ceo", PEOPLE, REPS);
  assert.deepStrictEqual(branch, company); // fallback
  assert.deepStrictEqual(team, { verifiedKnocks: 0, filed: 0, won: 0, revenue: 0 }); // no direct reps
});
