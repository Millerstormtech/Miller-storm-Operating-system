// src/lib/canvass/teamKnocks.ts
// The Canvass Map's "Knocks by" filter (spec A3, A2; Youssef, 8 Oct 2026: keep
// every house on the map, but mark as knocked only the houses the chosen team
// or branch knocked). A knock counts for the team and branch the rep was on
// ON THE DAY of the knock, the same rule as every board (team history,
// src/lib/teamhistory/segments.ts): a day before the rep's first period or in
// a gap goes to the nearest earlier period, else the first. A rep with no team
// history (left before it began) counts for no team.
//
// Pure: no database. pages/api/canvass/homes.ts and the filter both use it.

import type { Period, Placement } from "../teamhistory/periods";
import { centralDay } from "./dates";

export type KnockScope = { kind: "team" | "branch"; name: string };

/** "team:Daniel Reyes" or "branch:Fort Worth", the form the map's request carries. */
export function scopeParam(scope: KnockScope): string {
  return `${scope.kind}:${scope.name}`;
}

/** Reads the request's value back; null when it is not one of the two forms. */
export function parseScope(text: string): KnockScope | null {
  const match = /^(team|branch):(.+)$/.exec(text.trim());
  if (!match) return null;
  const name = match[2].trim();
  if (!name || name.length > 100) return null;
  return { kind: match[1] as KnockScope["kind"], name };
}

/** Where a rep was placed on a day, by the boards' rule. */
export function placementOn(periods: readonly Period[], day: string): Placement | null {
  if (periods.length === 0) return null;
  let index = 0;
  for (let i = 0; i < periods.length; i++) if (periods[i].from <= day) index = i;
  return { team: periods[index].team, branch: periods[index].branch };
}

export function inScope(placement: Placement | null, scope: KnockScope): boolean {
  if (!placement) return false;
  return scope.kind === "team" ? placement.team === scope.name : placement.branch === scope.name;
}

/** The parts of a stored door this needs: who knocked, and when. */
export type ScopeDoor = {
  homeId: unknown;
  knocks: Array<{ at: string | Date; userId?: number | null }>;
  statusChanges: Array<{ at: string | Date; userId?: number | null }>;
};

/** Every RepCard user id that knocked or changed a status on these doors, as text. */
export function knockUserIds(doors: readonly ScopeDoor[]): string[] {
  const ids = new Set<string>();
  for (const door of doors) for (const event of [...door.knocks, ...door.statusChanges]) if (event.userId !== null && event.userId !== undefined) ids.add(String(event.userId));
  return [...ids];
}

/**
 * For each house, the Texas day of the most recent knock or status change made
 * by someone in the scope. Events with no rep (a door's bare status) cannot be
 * placed, so they never count here.
 */
export function latestScopedKnockDay(doors: readonly ScopeDoor[], historyByRep: ReadonlyMap<string, readonly Period[]>, scope: KnockScope): Map<string, string> {
  const latest = new Map<string, string>();
  for (const door of doors) {
    if (door.homeId === null || door.homeId === undefined) continue;
    const homeId = String(door.homeId);
    for (const event of [...door.knocks, ...door.statusChanges]) {
      if (event.userId === null || event.userId === undefined) continue;
      const day = centralDay(event.at instanceof Date ? event.at : String(event.at));
      if (!day) continue;
      if (!inScope(placementOn(historyByRep.get(String(event.userId)) ?? [], day), scope)) continue;
      const known = latest.get(homeId);
      if (known === undefined || day > known) latest.set(homeId, day);
    }
  }
  return latest;
}

export type ScopeOptions = { branches: string[]; teams: Array<{ name: string; branch: string }> };

/**
 * What the filter offers: every branch and every team that appears anywhere in
 * the team history, so a past team can still be looked at. A team shows the
 * branch it was last in. "No team" is not offered.
 */
export function scopeOptions(histories: ReadonlyArray<readonly Period[]>): ScopeOptions {
  const branches = new Set<string>();
  const teamBranch = new Map<string, { branch: string; from: string }>();
  for (const periods of histories) {
    for (const period of periods) {
      if (period.branch) branches.add(period.branch);
      if (!period.team) continue;
      const known = teamBranch.get(period.team);
      if (!known || period.from >= known.from) teamBranch.set(period.team, { branch: period.branch, from: period.from });
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  return {
    branches: [...branches].sort(byName),
    teams: [...teamBranch.entries()].map(([name, { branch }]) => ({ name, branch })).sort((a, b) => byName(a.name, b.name)),
  };
}

/** The filter's words for a scope. No em dashes. */
export function scopeLabel(scope: KnockScope): string {
  return scope.kind === "team" ? `${scope.name}'s team` : `${scope.name} branch`;
}
