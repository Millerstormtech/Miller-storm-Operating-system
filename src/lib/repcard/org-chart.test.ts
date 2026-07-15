// src/lib/repcard/org-chart.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTeam, TEAM_NAMES, TEAM_BRANCH, resolveNameBranch } from "./org-chart.ts";

test("Brighton Jenkins and his reps resolve to Daniel Sabedra's team", () => {
  assert.equal(resolveTeam("Brighton Jenkins"), "Daniel Sabedra");
  assert.equal(resolveTeam("Matthew Stevens"), "Daniel Sabedra");
  assert.equal(resolveTeam("Chris Holman"), "Daniel Sabedra");
});

test("Brighton Jenkins is no longer a team", () => {
  assert.ok(!TEAM_NAMES.includes("Brighton Jenkins"));
  assert.equal(TEAM_BRANCH["Brighton Jenkins"], undefined);
});

test("other teams are unchanged", () => {
  assert.equal(resolveTeam("Gunner McCullough"), "Gunner");
  assert.equal(resolveTeam("Daniel Sabedra"), "Daniel Sabedra");
  assert.equal(TEAM_BRANCH["Daniel Sabedra"], "West Texas");
});

test("TEAM_NAMES lists the six real teams", () => {
  assert.deepEqual(TEAM_NAMES, ["Gunner", "Luke", "Jonathan", "Mike Muscari", "Cooper", "Daniel Sabedra"]);
});

test("Victor Gonzalez resolves to Cooper's team (Dallas)", () => {
  assert.equal(resolveTeam("Victor Gonzalez", "Management"), "Cooper");
  assert.equal(TEAM_BRANCH["Cooper"], "Dallas");
});

test("Victor Ramirez (separate person) stays on Cooper too", () => {
  assert.equal(resolveTeam("Victor Ramirez", ""), "Cooper");
});

test("Austin Apple resolves to Fort Worth via name-branch override", () => {
  assert.equal(resolveNameBranch("Austin Apple"), "Fort Worth");
});

test("resolveNameBranch returns '' for a normal rep", () => {
  assert.equal(resolveNameBranch("Daniel Reyes"), "");
});
