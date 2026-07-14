// src/lib/repcard/org-chart.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTeam, TEAM_NAMES, TEAM_BRANCH } from "./org-chart.ts";

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
