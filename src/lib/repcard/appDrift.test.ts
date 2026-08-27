import { test } from "node:test";
import assert from "node:assert/strict";
import { compareToRepCard, normalizeBranch } from "./appDrift.ts";

// The six real cases measured against production on 2026-08-27. Two are genuine
// mismatches and four MUST stay silent -- a warning nobody trusts is worse than
// no warning, so the four false positives are the point of these tests.

test("Johnny Franco: a sales rep in the wrong branch is reported", () => {
  const drift = compareToRepCard(
    { role: "sales", branch: "Dallas", teamLeadName: "Mike Muscari" },
    { branch: "Fort Worth", teamLeadName: "Jonathan Chambers" }
  );
  assert.deepEqual(drift.branch, { app: "Dallas", repcard: "Fort Worth" });
  assert.deepEqual(drift.team, { app: "Mike Muscari", repcard: "Jonathan Chambers" });
});

test("Declan Mathison: only the team lead differing is reported on its own", () => {
  const drift = compareToRepCard(
    { role: "sales", branch: "Fort Worth", teamLeadName: "Cooper Bledsoe" },
    { branch: "Fort Worth", teamLeadName: "Jonathan Chambers" }
  );
  assert.equal(drift.branch, undefined);
  assert.deepEqual(drift.team, { app: "Cooper Bledsoe", repcard: "Jonathan Chambers" });
});

test("Sergio Flores: legacy branch text that means the same branch stays silent", () => {
  const drift = compareToRepCard(
    { role: "sales", branch: "West Texas · DFW, Texas", teamLeadName: "Daniel Sabedra" },
    { branch: "West Texas", teamLeadName: "Daniel Sabedra" }
  );
  assert.deepEqual(drift, {});
});

test("Fernando Cano: the same, for Fort Worth", () => {
  const drift = compareToRepCard(
    { role: "sales", branch: "Fort Worth · DFW, Texas", teamLeadName: "Jonathan Chambers" },
    { branch: "Fort Worth", teamLeadName: "Jonathan Chambers" }
  );
  assert.deepEqual(drift, {});
});

test("Cooper Bledsoe: a team lead is never compared, he IS his team's lead", () => {
  // In the app a team lead reports up to a branch manager; in RepCard the team's
  // lead is the lead himself. Comparing the two is meaningless, not a mismatch.
  const drift = compareToRepCard(
    { role: "sales-team-lead", branch: "Dallas", teamLeadName: "Mike Muscari" },
    { branch: "Dallas", teamLeadName: "Cooper Bledsoe" }
  );
  assert.deepEqual(drift, {});
});

test("Luke Huber: nor is a branch manager", () => {
  const drift = compareToRepCard(
    { role: "branch-manager", branch: "Fort Worth", teamLeadName: "Jonathan Chambers" },
    { branch: "Fort Worth", teamLeadName: "Luke Huber" }
  );
  assert.deepEqual(drift, {});
});

test("no RepCard account means nothing to compare against", () => {
  const drift = compareToRepCard(
    { role: "sales", branch: "Dallas", teamLeadName: "Mike Muscari" },
    null
  );
  assert.deepEqual(drift, {});
});

test("a blank field in the app is unknown, not wrong", () => {
  const drift = compareToRepCard(
    { role: "sales", branch: "", teamLeadName: "" },
    { branch: "Fort Worth", teamLeadName: "Gunner McCullough" }
  );
  assert.deepEqual(drift, {});
});

test("a blank field on the RepCard side is unknown too", () => {
  const drift = compareToRepCard(
    { role: "sales", branch: "Dallas", teamLeadName: "Mike Muscari" },
    { branch: "", teamLeadName: "" }
  );
  assert.deepEqual(drift, {});
});

test("Nadine Adams: legacy text naming no real branch stays silent", () => {
  // "DFW, Texas · Lubbock, Texas · Round Rock, Texas · Other" holds no branch
  // name, so there is nothing to compare and we must not guess one.
  const drift = compareToRepCard(
    { role: "sales", branch: "DFW, Texas · Lubbock, Texas · Round Rock, Texas · Other", teamLeadName: "" },
    { branch: "Fort Worth", teamLeadName: "" }
  );
  assert.deepEqual(drift, {});
});

test("case and spacing differences are not mismatches", () => {
  const drift = compareToRepCard(
    { role: "sales", branch: "  fort worth  ", teamLeadName: "gunner mccullough" },
    { branch: "Fort Worth", teamLeadName: "Gunner McCullough" }
  );
  assert.deepEqual(drift, {});
});

test("normalizeBranch pulls the branch out of a legacy multi-value string", () => {
  assert.equal(normalizeBranch("West Texas · DFW, Texas"), "West Texas");
  assert.equal(normalizeBranch("Fort Worth · DFW, Texas"), "Fort Worth");
  assert.equal(normalizeBranch("Dallas"), "Dallas");
  assert.equal(normalizeBranch("  fort worth "), "Fort Worth");
});

test("normalizeBranch returns '' when no known branch is named", () => {
  assert.equal(normalizeBranch("DFW, Texas · Lubbock, Texas · Other"), "");
  assert.equal(normalizeBranch("Round Rock, Texas"), "");
  assert.equal(normalizeBranch(""), "");
  assert.equal(normalizeBranch(null), "");
  assert.equal(normalizeBranch(undefined), "");
});
