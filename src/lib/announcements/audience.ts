// Announcement audience resolution — who a "Who will see this" pick actually
// reaches, and the Mongo filter that expresses it.
//
// PURE ONLY: no database, no Next.js request/response. The API route
// (pages/api/announcements.ts) does the DB fetches (the caller's own record,
// every distinct branch, every team lead) and passes plain data in here — this
// is the single source of truth for the SCOPING RULES themselves, so it can be
// tested without a database and so the rules can never drift between the
// audience-size preview (GET) and the actual send (POST), which both call it.
//
// THE SERVER DECIDES THE SCOPE, never the client:
//   admin / c-level   → everyone, any branch(es), or any team(s)
//   branch-manager    → their own branch(es) only, or team(s) INSIDE their own branch(es)
//   sales-team-lead   → their own team only — the choice is never even read

export type AudienceChoice = {
  type?: string;
  branches?: string[];
  teamLeadIds?: string[];
};

/** A sales-team-lead, as a candidate "team" — branches already normalized (trim + lowercase). */
export type TeamLeadCandidate = { id: string; name: string; branches: string[] };

export type ResolveAudienceInput = {
  role: string;
  callerId: string;
  callerName: string;
  /** The caller's own branch values, in their real stored case — used in the actual query/label. */
  callerBranchesRaw: string[];
  /** The same values, normalized (trim + lowercase) — used only for matching. */
  callerBranchesNorm: string[];
  /** Every distinct branch in the system, in real stored case. */
  allBranchesRaw: string[];
  /** Every sales-team-lead in the system. */
  allTeamLeads: TeamLeadCandidate[];
};

export type ResolvedAudience = { filter: Record<string, unknown>; label: string };
export type ResolveAudienceResult = ResolvedAudience | { error: string };

export function isResolveError(r: ResolveAudienceResult): r is { error: string } {
  return "error" in r;
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const ACTIVE = { deleted: { $ne: true }, suspended: { $ne: true } };

function teamFilter(teamLeadIds: string[]) {
  return { ...ACTIVE, $or: [{ id: { $in: teamLeadIds } }, { managerId: { $in: teamLeadIds } }] };
}

export function resolveAudience(input: ResolveAudienceInput, raw: AudienceChoice): ResolveAudienceResult {
  const type = typeof raw?.type === "string" ? raw.type : "everyone";

  // ── sales-team-lead: no choice at all ─────────────────────────────────────
  if (input.role === "sales-team-lead") {
    return {
      filter: teamFilter([input.callerId]),
      label: `Team: ${input.callerName || "My Team"}`,
    };
  }

  // ── branch-manager: own branch(es), or teams inside them ─────────────────
  if (input.role === "branch-manager") {
    if (input.callerBranchesNorm.length === 0) {
      return { error: "Your account has no branch assigned, so there is no audience to send to." };
    }
    if (type === "team") {
      const requestedIds = Array.isArray(raw?.teamLeadIds) ? raw.teamLeadIds.map(String) : [];
      const allowed = input.allTeamLeads.filter((l) =>
        l.branches.some((b) => input.callerBranchesNorm.includes(b))
      );
      const allowedIds = new Set(allowed.map((l) => l.id));
      const teamLeadIds = requestedIds.filter((id) => allowedIds.has(id));
      if (teamLeadIds.length === 0) {
        return { error: "Pick at least one of your branch's teams." };
      }
      const names = allowed.filter((l) => teamLeadIds.includes(l.id)).map((l) => l.name);
      return {
        filter: teamFilter(teamLeadIds),
        label: `Team${names.length > 1 ? "s" : ""}: ${names.join(", ")}`,
      };
    }
    // "branch" (or anything else) — always their own full branch set, never a
    // client-chosen one.
    return {
      filter: {
        ...ACTIVE,
        $or: [
          { territory: { $in: input.callerBranchesRaw } },
          { branches: { $in: input.callerBranchesRaw } },
        ],
      },
      label: `Branch${input.callerBranchesRaw.length > 1 ? "es" : ""}: ${input.callerBranchesRaw.join(", ")}`,
    };
  }

  // ── admin / c-level: full authority, still validated against real data ───
  if (type === "branch") {
    const requested: string[] = Array.isArray(raw?.branches) ? raw.branches.map(String) : [];
    // Map to the canonical (actual DB-cased) value, not whatever casing the
    // client sent — territory/branches are matched exactly by Mongo's $in, so
    // a case mismatch here would silently match nobody.
    const canonicalByNorm = new Map(input.allBranchesRaw.map((b) => [norm(b), b]));
    const branches = Array.from(
      new Set(requested.map((b) => canonicalByNorm.get(norm(b))).filter((b): b is string => !!b))
    );
    if (branches.length === 0) return { error: "Pick at least one branch." };
    return {
      filter: { ...ACTIVE, $or: [{ territory: { $in: branches } }, { branches: { $in: branches } }] },
      label: `Branch${branches.length > 1 ? "es" : ""}: ${branches.join(", ")}`,
    };
  }
  if (type === "team") {
    const requestedIds: string[] = Array.isArray(raw?.teamLeadIds) ? raw.teamLeadIds.map(String) : [];
    const byId = new Map(input.allTeamLeads.map((l) => [l.id, l]));
    const teamLeadIds = requestedIds.filter((id) => byId.has(id));
    if (teamLeadIds.length === 0) return { error: "Pick at least one team." };
    const names = teamLeadIds.map((id) => byId.get(id)!.name);
    return {
      filter: teamFilter(teamLeadIds),
      label: `Team${names.length > 1 ? "s" : ""}: ${names.join(", ")}`,
    };
  }
  return { filter: ACTIVE, label: "Everyone" };
}
