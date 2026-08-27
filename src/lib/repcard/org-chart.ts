// src/lib/repcard/org-chart.ts
// Pure, import-free. Resolves a rep's TEAM, and which branch that team belongs to.
//
// SOURCE OF TRUTH: RepCard's own `team` field. RepCard is the system the branch
// managers actually maintain — a rep who changes teams is moved there the same
// day — so the leaderboard follows it and self-corrects.
//
// This file used to work the other way round: ROSTER below was transcribed by
// hand from the Sales Org Chart PDF (2026-07) and OVERRODE RepCard, which froze
// every rep on whatever team they were on in July. By 2026-08-27 that had
// misplaced five active reps, including Gunner's top knocker (Jason Nguyen,
// filed under Cooper in Dallas) and Justin Jones (under Mike Muscari in Dallas
// rather than Luke). Because Branch follows Team, their numbers were also being
// counted toward the wrong branch. Reported by Jason Nguyen, 2026-08-27.
//
// ROSTER is still needed: the role dashboards (pages/api/dashboard.ts), the
// training leaderboard and the Scoreboard all call resolveTeam() with a Miller
// Storm user's NAME only — they have no RepCard record to pass. It is therefore
// kept in step with RepCard so no surface can disagree with the sales board.
// Re-check it with `node check-repcard-team-drift.js` after any team shuffle.

const ROSTER: Record<string, string[]> = {
  // Fort Worth branch (mgr Gunner McCullough)
  Gunner: ["Gunner McCullough", "Alan Bieberle", "Daniel Reyes", "Michael Gonzalez", "Preston Taylor", "Jason Nguyen"],
  Luke: ["Luke Huber", "Alec Rodriguez", "Devin Ishmael", "Hieu Pham", "Jose Robles", "Trace Lutteringer", "Jordan Strong", "Dakota Porter", "Justin Jones", "Joe Charles"],
  Jonathan: ["Jonathan Chambers", "Austin Porter", "David Bolles", "Esteban Serna", "Fernando Cano", "Jordan Dillon", "Kelvin Burdiez", "Moises Belza", "Johnny Franco", "Declan Mathison", "Valentin Grajeda", "Waylon Dean"],
  // Dallas branch (mgr Mike Muscari)
  "Mike Muscari": ["Mike Muscari", "Jaren Lushaj", "Nathan Gregory", "Nate Gregory", "Dylan Looney"],
  Cooper: ["Cooper Bledsoe", "Colton Lathrom", "Martin Ramirez", "Victor Ramirez", "Victor Gonzalez", "Ashton Foster"],
  // West Texas branch (mgr Daniel Sabedra) — Brighton Jenkins folded in as a regular
  // rep (with Matthew Stevens + Chris Holman) 2026-07-14; he is no longer a team lead.
  "Daniel Sabedra": ["Daniel Sabedra", "Sergio Flores", "Shane Goldsmith", "Eduardo Ramos", "Colton Randolph", "Brighton Jenkins", "Matthew Stevens", "Chris Holman", "Trey Serna", "James Williams"],
};

// Deliberate team assignments that OVERRIDE RepCard, for decisions RepCard has
// not caught up on. Keep this list short and always say why: each entry is a
// place where the board knowingly contradicts the system of record.
//
// The Dylon team (Round Rock) was wound down on 2026-07-14 and its remaining reps
// folded into Daniel Sabedra's team. RepCard still lists them under "Dylon", which
// is not a real team and has no branch of its own, so without these they would
// show an unfilterable team and fall back to their office for a branch.
const TEAM_OVERRIDES: Record<string, string> = {
  "brighton jenkins": "Daniel Sabedra",
  "matthew stevens": "Daniel Sabedra",
  "chris holman": "Daniel Sabedra",
};

// Normalize RepCard's own team label to the naming used above. "Management" is
// RepCard's non-sales catch-all (execs, ops, office, dev), not a team, so it maps
// to "" — meaning "RepCard cannot place this rep", which falls through to ROSTER.
const TEAM_ALIAS: Record<string, string> = {
  jon: "Jonathan",
  jonathan: "Jonathan",
  "mike m.": "Mike Muscari",
  "mike m": "Mike Muscari",
  "daniel s": "Daniel Sabedra",
  luke: "Luke",
  cooper: "Cooper",
  gunner: "Gunner",
  "lubbock team": "Daniel Sabedra",
  dylon: "Dylon",
  commercial: "Commercial",
  management: "",
};

function norm(s?: string | null): string {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// Which branch each team belongs to. Team is the source of truth for reporting,
// so the leaderboard's Branch follows the team's branch whenever a team is known
// (RepCard office is only the fallback for reps with no team).
export const TEAM_BRANCH: Record<string, string> = {
  Gunner: "Fort Worth",
  Luke: "Fort Worth",
  Jonathan: "Fort Worth",
  "Mike Muscari": "Dallas",
  Cooper: "Dallas",
  "Daniel Sabedra": "West Texas",
  Commercial: "Commercial",
};

// Direct name -> branch overrides for reps with a KNOWN home branch but no sales team
// (former reps, cross-branch execs). Consulted after the team's branch and before the
// RepCard-office fallback. Keys are matched via the same `norm()` as team lookup.
export const NAME_TO_BRANCH: Record<string, string> = {
  "austin apple": "Fort Worth", // former rep, no RepCard directory entry -> no team to derive from
};

export function resolveNameBranch(name?: string | null): string {
  return NAME_TO_BRANCH[norm(name)] || "";
}

// Reps who should show NO branch — cross-branch execs (e.g. the CRO who storm-chases
// across regions). Pinning them to one branch would mislead; their office fallback is
// suppressed. Under team-based reporting that means they sit under no branch at
// all, so a branch filter never claims their numbers for a branch they do not run.
const BRANCHLESS_NAMES = new Set<string>([norm("Naaman Taylor")]);
export function isBranchless(name?: string | null): boolean {
  return BRANCHLESS_NAMES.has(norm(name));
}

const NAME_TO_TEAM = new Map<string, string>();
for (const [team, members] of Object.entries(ROSTER)) {
  for (const m of members) NAME_TO_TEAM.set(norm(m), team);
}

/**
 * Resolve a rep's team, in order:
 *   1. TEAM_OVERRIDES — a deliberate decision RepCard has not caught up on.
 *   2. RepCard's own `team`, normalized — the live source of truth, so a rep who
 *      moves teams moves on the board without anyone editing this file.
 *   3. ROSTER by name — for callers with no RepCard record to pass, and for reps
 *      RepCard cannot place (its non-sales "Management" bucket aliases to "").
 *   4. "" — nothing to go on.
 *
 * An unrecognized RepCard team is passed through as-is rather than dropped, so a
 * newly created team shows up on the board (unfiltered) instead of vanishing.
 */
export function resolveTeam(name?: string | null, repcardTeam?: string | null): string {
  const override = TEAM_OVERRIDES[norm(name)];
  if (override) return override;

  const raw = repcardTeam || "";
  if (raw) {
    const alias = TEAM_ALIAS[norm(raw)];
    // `alias === ""` is RepCard saying "not a sales team" (its Management bucket).
    // That is not an answer, so fall through to the roster rather than stripping a
    // real salesperson of the team the roster knows they are on.
    const fromRepCard = alias !== undefined ? alias : raw;
    if (fromRepCard) return fromRepCard;
  }

  return NAME_TO_TEAM.get(norm(name)) || "";
}

// The FIRST member of each team is its lead — the branch manager. Used by the
// admin Branch Manager dashboard to show each branch manager (team lead)
// individually with their own sales.
export const TEAM_LEADS: Record<string, string> = Object.fromEntries(
  Object.entries(ROSTER).map(([team, members]) => [team, members[0]])
);

// True when this rep is their team's lead (branch manager).
export function isTeamLead(name?: string | null, team?: string | null): boolean {
  if (!team) return false;
  const lead = TEAM_LEADS[team];
  return !!lead && norm(name) === norm(lead);
}

// Fixed, ordered team list for the leaderboard's Team filter, so the dropdown
// options never disappear based on which reps have data in the current range.
export const TEAM_NAMES: string[] = Object.keys(ROSTER);
