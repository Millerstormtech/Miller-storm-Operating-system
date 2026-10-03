// src/lib/repcard/org-chart.ts
// Pure, import-free. Decides a person's TEAM and BRANCH from the Miller Storm
// org chart: the roles and Team Leads set in User Management, the same data the
// in-app Org Chart page draws (pages/api/org-chart.ts). There is deliberately no
// typed list of names in this file.
//
// Decided by Youssef 2026-10-02 (support ticket MS-027 and follow-up). The rules
// mirror the Org Chart page (src/components/TeamStructure.tsx), so every board
// agrees with what admins see there:
//   - A team is named after its lead's full name ("Luke Huber").
//   - A sales rep is on their Team Lead's team when they have a Branch and that
//     Team Lead is a sales team lead or a branch manager. A rep set to No Branch
//     is unassigned on purpose: no team, no branch, whatever Team Lead is stored.
//   - Only sales reps have a Team Lead. Every team lead also knocks like a rep,
//     and every branch manager is also a team lead: each is on their own team.
//   - Branch: a rep shows their team lead's branch. A team lead's branch, and a
//     branch manager's, is the Branch on their own profile (User Management shows
//     a team lead's branch manager from that Branch, so the two always agree).
//   - Marketing, C-level and Admin accounts have no team and no branch, whatever
//     is stored on their profile.
//   - Deleted accounts keep their place, so former reps' numbers stay with the
//     team they sold for (details on buildOrgChart below).
//   - RepCard decides nothing for anyone who has an app account. It only places
//     reps who knock in RepCard but have no app account yet: their RepCard team
//     is matched to the app team its other members are on (repcardTeamMatcher).
//
// History: until 2026-10-02 this file held ROSTER, a hand-typed team list from
// the July 2026 org chart PDF, plus RepCard alias, override and branch tables.
// Every team move needed a code change, and the boards disagreed with each other
// and with User Management (Jose Robles stayed on Team Luke after he was moved).

/** A Miller Storm user, as far as the org chart needs. */
export interface DirectoryUser {
  id: string;
  name?: string | null;
  role?: string | null;
  /** The Team Lead assigned in User Management (a user id). */
  managerId?: string | null;
  /** The Branch picked in User Management. Older values may carry "· ..." suffixes. */
  territory?: string | null;
  /** Soft-deleted account. Kept so former reps' numbers stay with their team. */
  deleted?: boolean | null;
}

/** A RepCard directory record, as far as team matching needs. */
export interface RepCardRecord {
  email?: string | null;
  team?: string | null;
  status?: string | null;
}

/** Something in User Management an admin should fix. */
export interface OrgWarning {
  kind: "no-branch-manager" | "team-lead-deleted" | "team-lead-invalid" | "branch-differs";
  message: string;
}

function norm(s?: string | null): string {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** The Branch on a person's own profile ("" when unset).
 * Older values join several with "·"; only the first part counts. */
export function branchFromProfile(user: { territory?: string | null } | null | undefined): string {
  return ((user && user.territory) || "").toString().split("·")[0].trim();
}

export interface OrgChart {
  /** The team this person is on ("" for none). */
  teamOf(user: DirectoryUser | null | undefined): string;
  /** The branch this person counts toward ("" for none). */
  branchOf(user: DirectoryUser | null | undefined): string;
  /** True when this person leads a team. */
  isLead(user: DirectoryUser | null | undefined): boolean;
  /** The branch of a team ("" when unknown). */
  branchOfTeam(team: string | null | undefined): string;
  /** Every team led by a live account, by branch (`branchOrder`), then by name. */
  teams: string[];
  /** What admins should fix, by user id (live accounts only). */
  warnings: Map<string, OrgWarning[]>;
}

/**
 * Build the org chart from the app's users. Pass every non-test account,
 * DELETED ONES INCLUDED (flagged `deleted`): accounts are deleted all the time.
 *   - A former rep (deleted account) keeps the team stored on their account, so
 *     their numbers stay with the team they sold for. If that Team Lead has since
 *     stopped leading, they follow that person to the team they are on now.
 *   - A departed team lead's team stays in place for those numbers, but is not
 *     offered as a current team.
 *   - An active rep whose Team Lead was deleted stays on that team until they
 *     are given a new Team Lead, with a warning (the Org Chart page shows them
 *     as Unassigned meanwhile; the boards keep their numbers on the team).
 */
export function buildOrgChart(
  users: DirectoryUser[],
  branchOrder: Record<string, number> = {},
  normalizeBranch: (raw: string) => string = (raw) => raw
): OrgChart {
  const byId = new Map<string, DirectoryUser>();
  for (const u of users) if (u && u.id) byId.set(String(u.id), u);
  const nameOf = (u?: DirectoryUser | null) => ((u && u.name) || "").trim();
  const isBranchManager = (u?: DirectoryUser | null) => !!u && u.role === "branch-manager";
  // Only the sales side of the company has teams and branches.
  const onSalesSide = (u?: DirectoryUser | null) =>
    !!u && (u.role === "sales" || u.role === "sales-team-lead" || u.role === "branch-manager");
  const isTeamLeadRole = (u?: DirectoryUser | null) => !!u && u.role === "sales-team-lead";
  const canLead = (u?: DirectoryUser | null) => isTeamLeadRole(u) || isBranchManager(u);
  const managerOf = (u?: DirectoryUser | null) => (u && u.managerId ? byId.get(String(u.managerId)) : undefined);
  // No Branch: unassigned on purpose (the Org Chart's "Unassigned"). A choice
  // made on a LIVE profile; many older deleted accounts simply never had a
  // Branch filled in, and their stored Team Lead still places them.
  const unassigned = (u: DirectoryUser) => !u.deleted && u.role === "sales" && !branchFromProfile(u);
  // Profile Branch values, read through the caller's normaliser (older values
  // such as "Round Rock, Texas" predate the three branches).
  const branchOfProfile = (u?: DirectoryUser | null) => {
    const raw = branchFromProfile(u);
    return raw ? normalizeBranch(raw) || raw : "";
  };

  // Who leads a team: every sales team lead and every branch manager. Every
  // branch manager is also a team lead, and every team lead also knocks doors
  // like a rep (Youssef, 2026-10-02), so each is on their own team.
  const leadIds = new Set<string>();
  for (const u of byId.values()) if (canLead(u)) leadIds.add(String(u.id));
  const isLead = (u?: DirectoryUser | null) => !!u && leadIds.has(String(u.id));

  // The lead of the team this person is on, or undefined for none.
  const leadOf = (u?: DirectoryUser | null, seen = new Set<string>()): DirectoryUser | undefined => {
    if (!u || seen.has(String(u.id))) return undefined;
    seen.add(String(u.id));
    if (!onSalesSide(u)) return undefined;
    if (isLead(u)) return u;
    if (u.role !== "sales" || unassigned(u)) return undefined;
    const m = managerOf(u);
    if (!m) return undefined;
    if (canLead(m)) return m;
    // A former rep whose old Team Lead has since gone back to selling: follow
    // that person to the team they are on now.
    return u.deleted ? leadOf(m, seen) : undefined;
  };

  // Branches that have a live branch manager, for the warning below.
  const managedBranches = new Set<string>();
  for (const u of byId.values()) {
    const b = norm(branchOfProfile(u));
    if (isBranchManager(u) && !u.deleted && b) managedBranches.add(b);
  }
  // A team's branch is the Branch on its lead's profile.
  const leadBranch = (lead: DirectoryUser) => branchOfProfile(lead);

  const teamOf = (u?: DirectoryUser | null) => nameOf(leadOf(u));
  const branchOf = (u?: DirectoryUser | null): string => {
    if (!u || !onSalesSide(u) || unassigned(u)) return "";
    const lead = leadOf(u);
    return lead ? leadBranch(lead) : branchOfProfile(u);
  };

  const leadByTeam = new Map<string, DirectoryUser>();
  for (const id of leadIds) {
    const lead = byId.get(id)!;
    const name = nameOf(lead);
    // A live lead wins a name clash with a departed one.
    if (name && (!leadByTeam.has(name) || leadByTeam.get(name)!.deleted)) leadByTeam.set(name, lead);
  }
  const branchOfTeam = (team?: string | null) => (team && leadByTeam.has(team) ? leadBranch(leadByTeam.get(team)!) : "");

  const rank = (team: string) => {
    const b = branchOfTeam(team);
    return b in branchOrder ? branchOrder[b] : Number.MAX_SAFE_INTEGER;
  };
  const teams = [...leadByTeam.entries()]
    .filter(([, lead]) => !lead.deleted)
    .map(([team]) => team)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  const warnings = new Map<string, OrgWarning[]>();
  const warn = (u: DirectoryUser, w: OrgWarning) => {
    const list = warnings.get(String(u.id)) || [];
    list.push(w);
    warnings.set(String(u.id), list);
  };
  for (const u of byId.values()) {
    if (u.deleted) continue;
    if (isTeamLeadRole(u) && !managedBranches.has(norm(branchOfProfile(u)))) {
      warn(u, {
        kind: "no-branch-manager",
        message: "No branch manager for this team lead's Branch, so the team counts toward the Branch on this profile.",
      });
    }
    if (u.role !== "sales" || unassigned(u)) continue;
    const m = managerOf(u);
    if (!u.managerId) continue; // User Management requires one; nothing to add
    if (!m || (!m.deleted && !canLead(m))) {
      warn(u, { kind: "team-lead-invalid", message: "The Team Lead on this profile is not a current team lead. Pick a new one." });
      continue;
    }
    if (m.deleted) {
      warn(u, {
        kind: "team-lead-deleted",
        message: `Team Lead ${nameOf(m) || "(unnamed)"} has been deleted. This rep stays on that team until a new Team Lead is picked.`,
      });
    }
    const own = branchOfProfile(u);
    const team = branchOf(u);
    if (own && team && norm(own) !== norm(team)) {
      warn(u, {
        kind: "branch-differs",
        message: `Branch says ${own}, but their Team Lead is in ${team}. The boards use ${team}.`,
      });
    }
  }

  return { teamOf, branchOf, isLead, branchOfTeam, teams, warnings };
}

// RepCard's catch-all for people outside the sales teams (execs, office, dev).
// Not a team, so it never decides one.
const REPCARD_NON_TEAM = "management";

/** Does a RepCard team label read as this lead's name? "Gunner" -> Gunner
 * McCullough, "Jon" -> Jonathan Chambers, "Mike M." -> Mike Muscari, "Daniel
 * Reyes" -> Daniel Reyes, "Daniel S" -> Daniel Sabedra. "Lubbock Team" names no one. */
export function teamLabelNamesLead(label: string, leadName: string): boolean {
  const l = norm(label).split(" ").filter(Boolean);
  const n = norm(leadName).split(" ").filter(Boolean);
  if (!l.length || !n.length) return false;
  if (!n[0].startsWith(l[0])) return false;
  if (l.length === 1) return true;
  if (n.length < 2) return false;
  return n[n.length - 1].startsWith(l[1]);
}

/**
 * Translates a RepCard team label into the app team it corresponds to, for reps
 * who have no app account. No typed list: for each RepCard team, count which app
 * team its members (the ones who DO have app accounts) are on, and add a strong
 * preference for the lead the label is named after (RepCard's "Gunner" team
 * holds three of Gunner's reps and three of Daniel Reyes's, a tie the name
 * settles). The highest score wins; a tie, or nothing to go on, gives "".
 *
 * @param repcard    The RepCard directory.
 * @param appTeamOfEmail  The app team of the person with this (lower-cased)
 *                   email, "" if they have no account or no team.
 * @param teams      The app's teams (OrgChart.teams), named by lead.
 */
export function repcardTeamMatcher(
  repcard: RepCardRecord[],
  appTeamOfEmail: (email: string) => string,
  teams: string[]
): (repcardTeam: string | null | undefined) => string {
  const votes = new Map<string, Map<string, number>>();
  for (const r of repcard) {
    const label = norm(r.team);
    if (!label || label === REPCARD_NON_TEAM) continue;
    const appTeam = r.email ? appTeamOfEmail(String(r.email).trim().toLowerCase()) : "";
    if (!appTeam) continue;
    const forLabel = votes.get(label) || new Map<string, number>();
    forLabel.set(appTeam, (forLabel.get(appTeam) || 0) + 1);
    votes.set(label, forLabel);
  }

  const cache = new Map<string, string>();
  return (repcardTeam) => {
    const label = norm(repcardTeam);
    if (!label || label === REPCARD_NON_TEAM) return "";
    if (cache.has(label)) return cache.get(label)!;
    const score = new Map<string, number>(votes.get(label) || []);
    for (const t of teams) {
      if (teamLabelNamesLead(label, t)) score.set(t, (score.get(t) || 0) + 1000);
    }
    let best = "";
    let bestScore = 0;
    let tied = false;
    for (const [t, s] of score) {
      if (s > bestScore) { best = t; bestScore = s; tied = false; }
      else if (s === bestScore) tied = true;
    }
    const answer = tied ? "" : best;
    cache.set(label, answer);
    return answer;
  };
}
