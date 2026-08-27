// src/lib/repcard/org-chart.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTeam, TEAM_NAMES, TEAM_BRANCH, resolveNameBranch, isBranchless } from "./org-chart.ts";

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

test("Naaman Taylor is branchless (cross-branch CRO)", () => {
  assert.equal(isBranchless("Naaman Taylor"), true);
  assert.equal(isBranchless("Daniel Reyes"), false);
});

// --- RepCard is the source of truth for team membership (2026-08-27) -------
// Reported by Jason Nguyen: reps who changed teams were still shown under their
// old team on the sales leaderboard, because ROSTER (transcribed from the July
// org chart PDF) used to override RepCard's live `team` field.

test("RepCard's live team beats a stale roster entry", () => {
  // Alan Bieberle sits under Gunner in ROSTER. If RepCard says he moved to
  // Luke, the board must follow RepCard, not the hand-typed list.
  assert.equal(resolveTeam("Alan Bieberle", "Luke"), "Luke");
  assert.equal(resolveTeam("Alan Bieberle", "Cooper"), "Cooper");
  // ...and with no RepCard team to consult, the roster still answers.
  assert.equal(resolveTeam("Alan Bieberle"), "Gunner");
});

test("the reps reported as missing land on their real team", () => {
  // Jason Nguyen: RepCard says Gunner (Fort Worth); the old list said Cooper (Dallas).
  assert.equal(resolveTeam("Jason Nguyen", "Gunner"), "Gunner");
  assert.equal(TEAM_BRANCH[resolveTeam("Jason Nguyen", "Gunner")], "Fort Worth");
  // Justin Jones: RepCard says Luke (Fort Worth); the old list said Mike Muscari (Dallas).
  assert.equal(resolveTeam("Justin Jones", "Luke"), "Luke");
  assert.equal(TEAM_BRANCH[resolveTeam("Justin Jones", "Luke")], "Fort Worth");
});

test("the roster agrees with RepCard, so name-only callers match the board", () => {
  // The role dashboards, training leaderboard and Scoreboard call resolveTeam()
  // with a name only. They must not disagree with the sales leaderboard.
  assert.equal(resolveTeam("Jason Nguyen"), "Gunner");
  assert.equal(resolveTeam("Justin Jones"), "Luke");
  assert.equal(resolveTeam("Moises Belza"), "Jonathan");
  assert.equal(resolveTeam("Johnny Franco"), "Jonathan");
  assert.equal(resolveTeam("Declan Mathison"), "Jonathan");
});

test("deliberate overrides still beat RepCard", () => {
  // The Dylon team was wound down and its reps folded into Daniel Sabedra's
  // team; RepCard has not caught up, and "Dylon" has no branch of its own.
  assert.equal(resolveTeam("Brighton Jenkins", "Dylon"), "Daniel Sabedra");
  assert.equal(resolveTeam("Matthew Stevens", "Dylon"), "Daniel Sabedra");
  assert.equal(resolveTeam("Chris Holman", "Dylon"), "Daniel Sabedra");
});

test("a RepCard team of 'Management' falls through to the roster", () => {
  // "Management" is RepCard's non-sales bucket, not a team. Real salespeople
  // parked there must keep the team the roster gives them, not lose it.
  assert.equal(resolveTeam("Preston Taylor", "Management"), "Gunner");
  assert.equal(resolveTeam("Ashton Foster", "Management"), "Cooper");
});

test("a rep RepCard can place but the roster has never heard of", () => {
  assert.equal(resolveTeam("Joe Charles", "Luke"), "Luke");
  assert.equal(resolveTeam("Valentin Grajeda", "Jon"), "Jonathan");
});

test("nothing to go on resolves to no team", () => {
  assert.equal(resolveTeam("Nobody At All", ""), "");
  assert.equal(resolveTeam("Nobody At All", "Management"), "");
  assert.equal(resolveTeam(""), "");
});
