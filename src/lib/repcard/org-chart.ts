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
  Cooper: ["Cooper Bledsoe", "Colton Lathrom", "Declan Mathison", "Jason Nguyen", "Martin Ramirez", "Victor Ramirez", "Ashton Foster"],
  // West Texas branch (mgr Daniel Sabedra)
  "Daniel Sabedra": ["Daniel Sabedra", "Sergio Flores", "Shane Goldsmith", "Waylon Dean", "Eduardo Ramos", "Colton Randolph"],
  "Brighton Jenkins": ["Brighton Jenkins", "Matthew Stevens", "Chris Holman"],
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
