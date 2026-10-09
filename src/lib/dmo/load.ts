// src/lib/dmo/load.ts
// Fetches everything the DMO screens need for one viewer, then hands it to the
// pure rules (view.ts). NOT pure: database reads only, no decisions.
//
// The numbers come from computeSalesRows, the same calculation as the Sales
// Leaderboard, so a rep's DMO bar and their leaderboard row always agree.
// Teams and branches come from the org chart in User Management, like every
// board since 2026-10-02.
import { connectMongo } from "../mongodb";
import { RepCardKnockFactModel } from "../models/RepCardKnockFact";
import { DmoWeeklyModel } from "../models/DmoWeekly";
import { DmoMonthlyModel } from "../models/DmoMonthly";
import { computeSalesRows, loadSharedRosterData, type SalesLeaderRow, type SharedRosterData } from "../leaderboard/compute";
import { normEmail } from "../leaderboard/identity";
import { getWindowRange, customRange, centralDateStr } from "../acculynx/windows";
import { resolveScope } from "../scoreboard/resolve";
import { branchFromProfile } from "../repcard/org-chart";
import type { Scope } from "../scoreboard/types";
import { DMO_ROLES, CONTRACT_AVERAGE_DAYS } from "./config";
import { addDays, dmoClock, type DmoClock } from "./calendar";
import {
  formMonthFor, groupDmo, personDmo, sortGroups, sortPeople, ZERO,
  type Actuals, type GroupDmo, type MonthlyDoc, type PersonDmo, type WeeklyDoc,
} from "./view";

export interface Viewer {
  id: string;
  role: string;
  name: string;
  territory?: string | null;
}

export interface DmoBoard {
  clock: DmoClock;
  scope: Scope;
  /** The viewer's own DMO (null for Jay/Naaman, who don't fill one in). */
  me: PersonDmo | null;
  /** Everyone the viewer can see, red first. Only the viewer for a rep. */
  people: PersonDmo[];
  /** The viewer's whole scope added up (team, branch or company). */
  total: GroupDmo | null;
  /** One level down: teams for a Branch Manager, branches for leadership. */
  groups: GroupDmo[];
  /** Leadership only: every red team, with who owns fixing it. */
  slipping: Array<GroupDmo & { branch: string; branchOwner: string }>;
  /** Names for the user ids in commitment changes ("changed to 150 by Gunner"). */
  names: Record<string, string>;
}

const isDmoRole = (role?: string | null) => (DMO_ROLES as readonly string[]).includes(String(role || ""));

function actualsByUser(rows: SalesLeaderRow[]): Map<string, Actuals> {
  const out = new Map<string, Actuals>();
  for (const r of rows) {
    if (!r.repUserId) continue;
    const a = out.get(r.repUserId) || { ...ZERO };
    a.doors += r.verifiedKnocks || 0;
    a.claims += r.filed || 0;
    a.contracts += r.won || 0;
    a.contractDollars += r.revenue || 0;
    out.set(r.repUserId, a);
  }
  return out;
}

/** First day each email had a verified knock (Central date), for the 90-day ramp. */
async function firstKnockDays(emails: string[]): Promise<Map<string, string>> {
  if (emails.length === 0) return new Map();
  const rows = await RepCardKnockFactModel.aggregate([
    { $match: { repEmail: { $in: emails }, verifiedKnocks: { $gt: 0 } } },
    { $group: { _id: "$repEmail", first: { $min: "$occurredAt" } } },
  ]);
  return new Map(rows.map((r: any) => [String(r._id), centralDateStr(new Date(r.first))]));
}

/** Is this live account inside the viewer's scope? */
function inScope(u: any, scope: Scope, viewerId: string, shared: SharedRosterData): boolean {
  switch (scope.level) {
    case "self":
      return u.id === viewerId;
    case "team":
      return !!scope.team && shared.org.teamOf(u) === scope.team;
    case "branch":
      return !!scope.branch && shared.org.branchOf(u) === scope.branch;
    case "company":
      return true;
  }
}

export async function loadDmo(viewer: Viewer, now: Date = new Date()): Promise<DmoBoard> {
  await connectMongo();
  const clock = dmoClock(now);
  const scope = resolveScope(viewer);
  const shared = await loadSharedRosterData();
  const org = shared.org;

  const accounts = [...shared.byEmail.values()].filter((u: any) => isDmoRole(u.role) && inScope(u, scope, viewer.id, shared));
  const ids = accounts.map((u: any) => String(u.id));
  const emails = accounts.map((u: any) => normEmail(u.email)).filter(Boolean) as string[];
  const formMonth = formMonthFor(clock, now);

  const [weekRows, monthRows, avgRows, firstKnocks, weeklyDocs, monthlyDocs] = await Promise.all([
    computeSalesRows(getWindowRange("week", now), shared),
    computeSalesRows(getWindowRange("month", now), shared),
    computeSalesRows(customRange(addDays(clock.today, -(CONTRACT_AVERAGE_DAYS - 1)), clock.today, now), shared),
    firstKnockDays(emails),
    DmoWeeklyModel.find({ userId: { $in: ids }, weekOf: { $in: [clock.weekOf, clock.nextWeekOf] } }).lean(),
    DmoMonthlyModel.find({ userId: { $in: ids }, month: { $in: [clock.month, formMonth] } }).lean(),
  ]);

  const week = actualsByUser(weekRows);
  const month = actualsByUser(monthRows);
  const avg = actualsByUser(avgRows);
  const weekly = new Map<string, WeeklyDoc>();
  for (const d of weeklyDocs as any[]) weekly.set(`${d.userId}|${d.weekOf}`, d);
  const monthly = new Map<string, MonthlyDoc>();
  for (const d of monthlyDocs as any[]) monthly.set(`${d.userId}|${d.month}`, d);

  const people = accounts.map((u: any) =>
    personDmo(
      {
        userId: String(u.id),
        name: String(u.name || u.email || "Unnamed"),
        role: String(u.role),
        team: org.teamOf(u),
        branch: org.branchOf(u),
        firstKnockDay: firstKnocks.get(normEmail(u.email) || "") || null,
        week: week.get(u.id) || { ...ZERO },
        month: month.get(u.id) || { ...ZERO },
        contractDollarsLast90Days: (avg.get(u.id) || ZERO).contractDollars,
        thisWeek: weekly.get(`${u.id}|${clock.weekOf}`) || null,
        nextWeek: weekly.get(`${u.id}|${clock.nextWeekOf}`) || null,
        thisMonth: monthly.get(`${u.id}|${clock.month}`) || null,
        formMonth: monthly.get(`${u.id}|${formMonth}`) || null,
      },
      clock,
      now
    )
  );

  const me = isDmoRole(viewer.role) ? people.find((p) => p.userId === viewer.id) || null : null;
  const sorted = sortPeople(people);

  // Who owns a branch: its Branch Manager, from User Management.
  const branchOwner = (branch: string) =>
    people.find((p) => p.role === "branch-manager" && p.branch === branch)?.name || "";
  const byKey = (key: (p: PersonDmo) => string) => {
    const m = new Map<string, PersonDmo[]>();
    for (const p of people) {
      const k = key(p);
      if (!k) continue;
      m.set(k, [...(m.get(k) || []), p]);
    }
    return m;
  };
  const teamGroups = () => [...byKey((p) => p.team)].map(([team, members]) => groupDmo(team, team, members, clock));

  let total: GroupDmo | null = null;
  let groups: GroupDmo[] = [];
  let slipping: DmoBoard["slipping"] = [];
  if (scope.level === "team") {
    total = groupDmo(scope.team || "", scope.team || "", people, clock);
  } else if (scope.level === "branch") {
    total = groupDmo(scope.branch || "", viewer.name, people, clock);
    groups = sortGroups(teamGroups());
  } else if (scope.level === "company") {
    total = groupDmo("Company", "", people, clock);
    groups = sortGroups([...byKey((p) => p.branch)].map(([b, members]) => groupDmo(b, branchOwner(b), members, clock)));
    slipping = sortGroups(teamGroups())
      .filter((g) => g.colour === "red")
      .map((g) => {
        const branch = org.branchOfTeam(g.key);
        return { ...g, branch, branchOwner: branchOwner(branch) };
      });
  }

  // Who changed a commitment: their name, so the screen can say "changed by Gunner".
  const nameById = new Map([...shared.byEmail.values()].map((u: any) => [String(u.id), String(u.name || u.email || "")]));
  const names: Record<string, string> = {};
  for (const p of people) {
    for (const c of [p.thisWeek.commitment, p.weeklyForm.commitment]) {
      for (const a of c?.adjustments || []) names[a.byUserId] = nameById.get(a.byUserId) || "your Team Lead";
    }
  }

  return { clock, scope, me, people: sorted, total, groups, slipping, names };
}

/**
 * Can `actor` change `target`'s commitment? A Team Lead: anyone on their team.
 * A Branch Manager: anyone in their branch. Admin: anyone. Never themselves
 * (they edit their own form instead).
 */
export function canAdjust(actor: any, target: any, shared: SharedRosterData): boolean {
  if (!actor || !target || actor.id === target.id || !isDmoRole(target.role)) return false;
  if (actor.role === "admin") return true;
  if (actor.role === "sales-team-lead") return shared.org.teamOf(target) === (actor.name || "").trim();
  if (actor.role === "branch-manager") {
    const branch = branchFromProfile(actor);
    return !!branch && shared.org.branchOf(target) === shared.org.branchOf(actor);
  }
  return false;
}
