// src/lib/repcard/org-chart.ts
// Pure, import-free. Team assignments from the Miller Storm Sales Org Chart
// (docs/Miller Storm Org Chart - Sales Team.pdf, 2026-07). Maps a rep's NAME to
// their team (team lead / branch manager). RepCard's own `team` is a cleaned
// fallback for anyone not on the chart; its generic "Management" bucket
// (non-sales: execs, ops, office, dev) is intentionally dropped to "".
//
// Verified against the live roster 2026-07-11: of 53 active RepCard reps, 44
// resolve to a team here; the remaining 9 are the non-sales "Management" accounts
// (which never appear on the knock-gated leaderboard anyway).

const ORG_TEAMS: Record<string, string[]> = {
  // Fort Worth branch (mgr Gunner McCullough)
  Gunner: ["Gunner McCullough", "Alan Bieberle", "Daniel Reyes", "Michael Gonzalez", "Preston Taylor"],
  Luke: ["Luke Huber", "Alec Rodriguez", "Devin Ishmael", "Hieu Pham", "Jose Robles", "Moises Belza", "Trace Lutteringer", "Jordan Strong", "Dakota Porter"],
  Jonathan: ["Jonathan Chambers", "Austin Porter", "David Bolles", "Esteban Serna", "Fernando Cano", "Jordan Dillon", "Kelvin Burdiez"],
  // Dallas branch (mgr Mike Muscari)
  "Mike Muscari": ["Mike Muscari", "Jaren Lushaj", "Johnny Franco", "Nathan Gregory", "Nate Gregory", "Dylan Looney", "Justin Jones"],
  Cooper: ["Cooper Bledsoe", "Colton Lathrom", "Declan Mathison", "Jason Nguyen", "Martin Ramirez", "Victor Ramirez", "Victor Gonzalez", "Ashton Foster"],
  // West Texas branch (mgr Daniel Sabedra) — Brighton Jenkins folded in as a regular
  // rep (with Matthew Stevens + Chris Holman) 2026-07-14; he is no longer a team lead.
  "Daniel Sabedra": ["Daniel Sabedra", "Sergio Flores", "Shane Goldsmith", "Waylon Dean", "Eduardo Ramos", "Colton Randolph", "Brighton Jenkins", "Matthew Stevens", "Chris Holman"],
};

// Normalize RepCard's own team label to org-chart naming. "Management" is a
// non-sales catch-all -> "" (no team).
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

// Which branch each team belongs to. Team is the org-chart source of truth, so
// the leaderboard's Branch follows the team's branch whenever a team is known
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

const NAME_TO_TEAM = new Map<string, string>();
for (const [team, members] of Object.entries(ORG_TEAMS)) {
  for (const m of members) NAME_TO_TEAM.set(norm(m), team);
}

// Resolve a rep's team: org chart by name first, then a cleaned RepCard team,
// else "" (non-sales / unknown, e.g. RepCard "Management").
export function resolveTeam(name?: string | null, repcardTeam?: string | null): string {
  const byOrg = NAME_TO_TEAM.get(norm(name));
  if (byOrg) return byOrg;
  const t = repcardTeam || "";
  if (!t) return "";
  const alias = TEAM_ALIAS[norm(t)];
  return alias !== undefined ? alias : t;
}

// The FIRST member of each team is its lead — the branch manager. Used by the
// admin Branch Manager dashboard to show each branch manager (team lead)
// individually with their own sales.
export const TEAM_LEADS: Record<string, string> = Object.fromEntries(
  Object.entries(ORG_TEAMS).map(([team, members]) => [team, members[0]])
);

// True when this rep is their team's lead (branch manager).
export function isTeamLead(name?: string | null, team?: string | null): boolean {
  if (!team) return false;
  const lead = TEAM_LEADS[team];
  return !!lead && norm(name) === norm(lead);
}

// Fixed, ordered team list for the leaderboard's Team filter, so the dropdown
// options never disappear based on which reps have data in the current range.
export const TEAM_NAMES: string[] = Object.keys(ORG_TEAMS);
