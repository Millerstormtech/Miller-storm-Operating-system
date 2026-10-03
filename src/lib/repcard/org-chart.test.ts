// src/lib/repcard/org-chart.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOrgChart,
  branchFromProfile,
  repcardTeamMatcher,
  teamLabelNamesLead,
  type DirectoryUser,
} from "./org-chart.ts";

// A small company shaped like the real one (2026-10-02).
const users: DirectoryUser[] = [
  { id: "jay", name: "Jay Miller", role: "c-level", territory: "" },
  { id: "naaman", name: "Naaman Taylor", role: "c-level", territory: "", managerId: "jay" },
  { id: "gunner", name: "Gunner McCullough", role: "branch-manager", territory: "Fort Worth", managerId: "naaman" },
  { id: "mike", name: "Mike Muscari", role: "branch-manager", territory: "Dallas" },
  { id: "dev", name: "Dev Branch Manager", role: "branch-manager", territory: "Lubbock, Texas" },
  { id: "luke", name: "Luke Huber", role: "sales-team-lead", territory: "Fort Worth", managerId: "jonathan" },
  { id: "jonathan", name: "Jonathan Chambers", role: "sales-team-lead", territory: "Fort Worth" },
  { id: "reyes", name: "Daniel Reyes", role: "sales-team-lead", territory: "Fort Worth", managerId: "gunner" },
  { id: "jose", name: "Jose Robles", role: "sales", territory: "Fort Worth", managerId: "reyes" },
  { id: "devin", name: "Devin Ishmael", role: "sales", territory: "Fort Worth", managerId: "luke" },
  { id: "alan", name: "Alan Bieberle", role: "sales", territory: "Fort Worth", managerId: "gunner" },
  { id: "quinton", name: "Quinton Hill", role: "sales", territory: "", managerId: "gunner" },
  { id: "nathan", name: "Nathan Gregory", role: "sales", territory: "Dallas", managerId: "mike" },
  { id: "gabbie", name: "Gabbie Sengphachanh", role: "sales", territory: "" },
  { id: "orphan", name: "Gus Orphan", role: "sales", territory: "Dallas", managerId: "deleted-lead" },
  { id: "valentin", name: "Valentin Grajeda", role: "marketing", territory: "", managerId: "jonathan" },
  { id: "omar", name: "Omar Sorour", role: "marketing", territory: "", managerId: "jay" },
];
const byId = new Map(users.map((u) => [u.id, u]));
const org = buildOrgChart(users, { "Fort Worth": 0, Dallas: 1, "West Texas": 2 });
const teamOf = (id: string) => org.teamOf(byId.get(id));

test("a rep is on the team of the Team Lead set in User Management", () => {
  assert.equal(teamOf("jose"), "Daniel Reyes");
  assert.equal(teamOf("devin"), "Luke Huber");
});

test("moving a rep's Team Lead moves them, with no other edit (MS-027)", () => {
  const moved = buildOrgChart(users.map((u) => (u.id === "jose" ? { ...u, managerId: "luke" } : u)));
  assert.equal(moved.teamOf({ ...byId.get("jose")!, managerId: "luke" }), "Luke Huber");
});

test("a team lead is on their own team, whoever their own Team Lead is", () => {
  assert.equal(teamOf("luke"), "Luke Huber");
  assert.equal(teamOf("reyes"), "Daniel Reyes");
  assert.equal(org.isLead(byId.get("luke")), true);
});

test("a branch manager with reps assigned to them leads a team", () => {
  assert.equal(teamOf("gunner"), "Gunner McCullough");
  assert.equal(teamOf("alan"), "Gunner McCullough");
  assert.equal(org.isLead(byId.get("gunner")), true);
});

test("every branch manager leads a team, even before any rep is assigned", () => {
  assert.equal(teamOf("dev"), "Dev Branch Manager");
  assert.equal(org.isLead(byId.get("dev")), true);
});

test("no team without a Team Lead, or with one who no longer exists", () => {
  assert.equal(teamOf("gabbie"), "");
  assert.equal(teamOf("orphan"), "");
  assert.equal(org.teamOf(null), "");
});

test("execs are on no team even when they report to someone", () => {
  assert.equal(teamOf("naaman"), "");
  assert.equal(teamOf("jay"), "");
});

test("only sales reps take a team from a Team Lead, like the Org Chart page", () => {
  // Valentin Grajeda holds the Marketing role: fix the role, not the code.
  assert.equal(teamOf("valentin"), "");
  assert.equal(teamOf("omar"), "");
});

test("a team's branch is its lead's profile Branch", () => {
  assert.equal(org.branchOfTeam("Daniel Reyes"), "Fort Worth");
  assert.equal(org.branchOfTeam("Mike Muscari"), "Dallas");
  assert.equal(org.branchOfTeam("Nobody"), "");
  assert.equal(org.branchOfTeam(""), "");
});

test("teams are listed by branch, then by name", () => {
  // "Lubbock, Texas" is not one of the three branches here (no normaliser), so it sorts last.
  assert.deepEqual(org.teams, ["Daniel Reyes", "Gunner McCullough", "Jonathan Chambers", "Luke Huber", "Mike Muscari", "Dev Branch Manager"]);
});

test("branch comes from the profile, blank when unset", () => {
  assert.equal(branchFromProfile({ territory: "West Texas · DFW, Texas" }), "West Texas");
  assert.equal(branchFromProfile({ territory: "" }), "");
  assert.equal(branchFromProfile(null), "");
});

test("RepCard team labels name their lead", () => {
  assert.equal(teamLabelNamesLead("Gunner", "Gunner McCullough"), true);
  assert.equal(teamLabelNamesLead("Jon", "Jonathan Chambers"), true);
  assert.equal(teamLabelNamesLead("Mike M.", "Mike Muscari"), true);
  assert.equal(teamLabelNamesLead("Daniel S", "Daniel Sabedra"), true);
  assert.equal(teamLabelNamesLead("Daniel S", "Daniel Reyes"), false);
  assert.equal(teamLabelNamesLead("Daniel Reyes", "Daniel Reyes"), true);
  assert.equal(teamLabelNamesLead("Lubbock Team", "Daniel Sabedra"), false);
  assert.equal(teamLabelNamesLead("", "Luke Huber"), false);
});

// RepCard as it really was on 2026-10-02: its "Gunner" team still held Daniel
// Reyes's reps, Jose's own RepCard team was "Daniel Reyes", and two Cooper reps
// sat in RepCard's Management bucket or had no app account.
const appTeamByEmail: Record<string, string> = {
  "gunner@x": "Gunner McCullough", "alan@x": "Gunner McCullough", "michael@x": "Gunner McCullough",
  "reyes@x": "Daniel Reyes", "cayden@x": "Daniel Reyes", "ben@x": "Daniel Reyes", "jose@x": "Daniel Reyes",
  "cooper@x": "Cooper Bledsoe", "colton@x": "Cooper Bledsoe", "ashton@x": "Cooper Bledsoe",
  "sergio@x": "Daniel Sabedra", "shane@x": "Daniel Sabedra", "brighton@x": "Daniel Sabedra",
  "jonathan@x": "Jonathan Chambers", "fernando@x": "Jonathan Chambers",
  "quinton@x": "Gunner McCullough",
};
const repcard = [
  { email: "gunner@x", team: "Gunner" }, { email: "alan@x", team: "Gunner" }, { email: "michael@x", team: "Gunner" },
  { email: "reyes@x", team: "Gunner" }, { email: "cayden@x", team: "Gunner" }, { email: "ben@x", team: "Gunner" },
  { email: "jose@x", team: "Daniel Reyes" },
  { email: "cooper@x", team: "Cooper" }, { email: "colton@x", team: "Cooper" },
  { email: "ashton@x", team: "Management" }, { email: "quinton@x", team: "Management" },
  { email: "sergio@x", team: "Lubbock Team" }, { email: "shane@x", team: "Lubbock Team" },
  { email: "brighton@x", team: "Dylon" },
  { email: "jonathan@x", team: "Jon" }, { email: "fernando@x", team: "Jon" },
  // Knocks in RepCard, no app account yet.
  { email: "martin@x", team: "Cooper" }, { email: "david@x", team: "Jon" },
];
const teams = ["Cooper Bledsoe", "Daniel Reyes", "Daniel Sabedra", "Gunner McCullough", "Jonathan Chambers"];
const matchTeam = repcardTeamMatcher(repcard, (e) => appTeamByEmail[e] || "", teams);

test("a RepCard-only rep gets the app team their RepCard team corresponds to", () => {
  assert.equal(matchTeam("Cooper"), "Cooper Bledsoe"); // Martin Ramirez
  assert.equal(matchTeam("Jon"), "Jonathan Chambers"); // David Bolles
});

test("a tie in membership is settled by the lead the RepCard team is named after", () => {
  // RepCard "Gunner": 3 on Gunner's app team, 3 on Daniel Reyes's.
  assert.equal(matchTeam("Gunner"), "Gunner McCullough");
});

test("RepCard teams named after no one follow their members", () => {
  assert.equal(matchTeam("Lubbock Team"), "Daniel Sabedra");
  assert.equal(matchTeam("Dylon"), "Daniel Sabedra");
  assert.equal(matchTeam("Daniel Reyes"), "Daniel Reyes");
});

test("RepCard's Management bucket, a blank team or an unknown one place no one", () => {
  assert.equal(matchTeam("Management"), "");
  assert.equal(matchTeam(""), "");
  assert.equal(matchTeam(null), "");
  assert.equal(matchTeam("Brand New Team"), "");
});

test("a genuine tie with no name to settle it places no one", () => {
  const m = repcardTeamMatcher(
    [{ email: "a@x", team: "Storm" }, { email: "b@x", team: "Storm" }],
    (e) => ({ "a@x": "Luke Huber", "b@x": "Cooper Bledsoe" } as Record<string, string>)[e] || "",
    ["Luke Huber", "Cooper Bledsoe"]
  );
  assert.equal(m("Storm"), "");
});

// ---- Branches, No Branch and deleted accounts (2026-10-02) ----
// Only reps have a Team Lead. A team lead's branch is the Branch on their profile.

const chart2: DirectoryUser[] = [
  { id: "gunner", name: "Gunner McCullough", role: "branch-manager", territory: "Fort Worth" },
  { id: "mike", name: "Mike Muscari", role: "branch-manager", territory: "Dallas" },
  { id: "sabedra", name: "Daniel Sabedra", role: "branch-manager", territory: "West Texas" },
  // A leftover link on a team lead (User Management has no such field) changes nothing.
  { id: "reyes", name: "Daniel Reyes", role: "sales-team-lead", territory: "Fort Worth", managerId: "mike" },
  // A rep whose own Branch is out of date: the team lead's wins, with a warning.
  { id: "jose", name: "Jose Robles", role: "sales", territory: "West Texas", managerId: "reyes" },
  { id: "jonathan", name: "Jonathan Chambers", role: "sales-team-lead", territory: "Fort Worth" },
  // A leftover link to another team lead is ignored (a team lead never has a Team Lead).
  { id: "luke", name: "Luke Huber", role: "sales-team-lead", territory: "Fort Worth", managerId: "jonathan" },
  { id: "devin", name: "Devin Ishmael", role: "sales", territory: "Fort Worth", managerId: "luke" },
  // A team lead in a branch with no branch manager.
  { id: "ramon", name: "Ramon Ortiz", role: "sales-team-lead", territory: "Corpus Christi" },
  { id: "eli", name: "Eli Cruz", role: "sales", territory: "Corpus Christi", managerId: "ramon" },
  // No Branch: unassigned on purpose, an old Team Lead still stored.
  { id: "quinton", name: "Quinton Hill", role: "sales", territory: "", managerId: "gunner" },
  // A team lead who left, one active rep still assigned to them.
  { id: "dylon", name: "Dylon McCune", role: "sales-team-lead", territory: "West Texas", deleted: true },
  { id: "shane", name: "Shane Goldsmith", role: "sales", territory: "West Texas", managerId: "dylon" },
  // Former reps (deleted accounts) keep their place.
  { id: "former", name: "Cameron Beer", role: "sales", territory: "Fort Worth", managerId: "reyes", deleted: true },
  { id: "brighton", name: "Brighton Jenkins", role: "sales", territory: "West Texas", managerId: "sabedra" },
  { id: "formerB", name: "Paxton Pope", role: "sales", territory: "West Texas", managerId: "brighton", deleted: true },
  // A rep whose Team Lead is not a lead (or no longer exists).
  { id: "stray", name: "Stray Rep", role: "sales", territory: "Dallas", managerId: "bob" },
  { id: "lost", name: "Lost Rep", role: "sales", territory: "Dallas", managerId: "gone@x.com" },
  { id: "bob", name: "Bob Adams", role: "c-level", territory: "", managerId: "marketingwithjim@gmail.com" },
  // Marketing and C-level have no team or branch, whatever is stored.
  { id: "valentin", name: "Valentin Grajeda", role: "marketing", territory: "Fort Worth", managerId: "jonathan" },
  { id: "carley", name: "Carley Jacobs", role: "c-level", territory: "Fort Worth · Dallas · West Texas" },
];
const by2 = new Map(chart2.map((u) => [u.id, u]));
const org2 = buildOrgChart(chart2, { "Fort Worth": 0, Dallas: 1, "West Texas": 2 });
const t2 = (id: string) => org2.teamOf(by2.get(id));
const b2 = (id: string) => org2.branchOf(by2.get(id));
const w2 = (id: string) => (org2.warnings.get(id) || []).map((w) => w.kind);

test("a team lead's branch is the Branch on their own profile", () => {
  assert.equal(b2("reyes"), "Fort Worth"); // a leftover link to Mike (Dallas) changes nothing
  assert.equal(b2("jonathan"), "Fort Worth");
});

test("a rep shows their team lead's branch, and is warned when their own Branch differs", () => {
  assert.equal(b2("jose"), "Fort Worth");
  assert.deepEqual(w2("jose"), ["branch-differs"]);
  assert.equal(org2.branchOfTeam("Daniel Reyes"), "Fort Worth");
});

test("a team lead never has a Team Lead: a leftover link to another lead is ignored", () => {
  assert.equal(t2("luke"), "Luke Huber");
  assert.equal(b2("luke"), "Fort Worth");
  assert.equal(t2("devin"), "Luke Huber");
  assert.deepEqual(w2("luke"), []);
});

test("a branch manager shows the Branch on their own profile", () => {
  assert.equal(b2("gunner"), "Fort Worth");
  assert.equal(b2("mike"), "Dallas");
});

test("a team lead whose Branch has no branch manager keeps their own Branch, with a warning", () => {
  assert.equal(b2("ramon"), "Corpus Christi");
  assert.equal(b2("eli"), "Corpus Christi");
  assert.deepEqual(w2("ramon"), ["no-branch-manager"]);
});

test("a sales rep set to No Branch is unassigned, whatever Team Lead is still stored", () => {
  assert.equal(t2("quinton"), "");
  assert.equal(b2("quinton"), "");
  assert.deepEqual(w2("quinton"), []);
});

test("an active rep whose Team Lead was deleted stays on that team, with a warning", () => {
  assert.equal(t2("shane"), "Dylon McCune");
  assert.equal(b2("shane"), "West Texas"); // the West Texas branch manager's Branch
  assert.deepEqual(w2("shane"), ["team-lead-deleted"]);
});

test("a departed lead's team is not offered as a current team", () => {
  assert.equal(org2.teams.includes("Dylon McCune"), false);
  assert.equal(org2.teams.includes("Daniel Reyes"), true);
});

test("a former rep (deleted account) keeps the team and branch they sold for", () => {
  assert.equal(t2("former"), "Daniel Reyes");
  assert.equal(b2("former"), "Fort Worth");
  assert.deepEqual(w2("former"), []); // deleted accounts are never warned about
});

test("a former rep whose old lead now sells follows that person to their current team", () => {
  assert.equal(t2("formerB"), "Daniel Sabedra");
  assert.equal(b2("formerB"), "West Texas");
});

test("a rep whose Team Lead is not a lead, or no longer exists, has no team and is flagged", () => {
  assert.equal(t2("stray"), "");
  assert.equal(b2("stray"), "Dallas"); // their own Branch
  assert.deepEqual(w2("stray"), ["team-lead-invalid"]);
  assert.deepEqual(w2("lost"), ["team-lead-invalid"]);
});

test("execs' reporting lines are left alone", () => {
  assert.equal(t2("bob"), "");
  assert.deepEqual(w2("bob"), []);
});

test("Marketing and C-level accounts have no team and no branch, whatever is stored", () => {
  assert.equal(t2("valentin"), "");
  assert.equal(b2("valentin"), "");
  assert.equal(t2("carley"), "");
  assert.equal(b2("carley"), "");
});

test("a former rep with no Branch on their old account is still placed by their Team Lead", () => {
  const org = buildOrgChart([
    { id: "mike", name: "Mike Muscari", role: "branch-manager", territory: "Dallas" },
    { id: "nathan", name: "Nathan Gregory", role: "sales", territory: "Dallas", managerId: "mike" },
    { id: "cameron", name: "Cameron Beer", role: "sales", territory: "", managerId: "mike", deleted: true },
  ]);
  const cameron = { id: "cameron", name: "Cameron Beer", role: "sales", territory: "", managerId: "mike", deleted: true };
  assert.equal(org.teamOf(cameron), "Mike Muscari");
  assert.equal(org.branchOf(cameron), "Dallas");
});

test("older Branch values are read through the normaliser", () => {
  const westTexas = (raw: string) => (/round rock|lubbock/i.test(raw) ? "West Texas" : raw);
  const users = [
    { id: "sabedra", name: "Daniel Sabedra", role: "branch-manager", territory: "West Texas" },
    { id: "dylon", name: "Dylon McCune", role: "sales-team-lead", territory: "Round Rock, Texas", deleted: true },
  ];
  const org = buildOrgChart(users, {}, westTexas);
  assert.equal(org.branchOf(users[1]), "West Texas");
});
