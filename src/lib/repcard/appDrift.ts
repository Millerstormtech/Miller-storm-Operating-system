// src/lib/repcard/appDrift.ts
// Pure, import-free. Decides whether a Miller Storm user's Branch and Team fields
// disagree with what RepCard says, for the advisory warning in User Management.
//
// This is ADVISORY ONLY. It never blocks a save and never changes a value: RepCard
// is the source of truth for the sales leaderboard (see org-chart.ts), but the app's
// Branch and Team also drive permissions and the org chart, and sometimes RepCard is
// the one that is out of date. A human decides.
//
// The hard part is silence, not detection. Measured against production on
// 2026-08-27, a naive "field A != field B" check lit up 8 of 52 users and only 2
// were real. A warning nobody trusts is worse than no warning, so three rules keep
// the false positives out. Each rule exists because of a specific real account:
//
//   1. SALES ONLY. A sales-team-lead or branch-manager IS their own team's lead, so
//      comparing the app's "who do you report to" against RepCard's "whose team is
//      this" is meaningless (Cooper Bledsoe, Luke Huber). Leadership can also
//      legitimately span several branches, which a single RepCard office cannot
//      express. Both fields are therefore compared for role "sales" only.
//   2. BLANK IS UNKNOWN, NOT WRONG. An empty field on either side means nobody has
//      said, so there is nothing to disagree about. Blank Branch is correct and
//      deliberate for the execs and admins (Jay, Nadine, Bob, Naaman), and a blank
//      team lead is correct for anyone who leads rather than reports.
//   3. NORMALIZE THE BRANCH TEXT FIRST. `territory` still holds values from an older
//      multi-select UI, e.g. "West Texas · DFW, Texas" (Sergio Flores) and
//      "Fort Worth · DFW, Texas" (Fernando Cano). Those name the same branch RepCard
//      does. Text naming no branch at all stays silent rather than being guessed at.

/** The three real branches, as offered by the Branch picker in User Management. */
const BRANCH_NAMES = ["Fort Worth", "Dallas", "West Texas"] as const;

function norm(s?: string | null): string {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * The branch a `territory` value names, in canonical spelling, or "" when it names
 * none. Handles the legacy "·"-joined multi-value strings by taking the first
 * segment that is a real branch. "" is deliberately returned rather than a guess:
 * a value like "Round Rock, Texas" predates the three-branch model and we must not
 * invent a branch for it.
 */
export function normalizeBranch(value?: string | null): string {
  for (const part of String(value || "").split("·")) {
    const hit = BRANCH_NAMES.find((b) => norm(b) === norm(part));
    if (hit) return hit;
  }
  return "";
}

/** A Miller Storm user's side of the comparison. */
export interface AppSide {
  role: string;
  /** The `territory` field, legacy formats and all. */
  branch: string;
  /** The NAME of the assigned Sales Team Lead, "" when none is assigned. */
  teamLeadName: string;
}

/** What RepCard says, already resolved through the org chart. */
export interface RepCardSide {
  branch: string;
  /** The NAME of the lead of the RepCard team this rep sits on. */
  teamLeadName: string;
}

/** One disagreement: what the app holds, and what RepCard says instead. */
export interface FieldDrift {
  app: string;
  repcard: string;
}

/** Empty when the two agree, or when there is nothing to compare. */
export interface Drift {
  branch?: FieldDrift;
  team?: FieldDrift;
}

/**
 * Which of Branch / Team disagree with RepCard. `null` for `rc` means this user has
 * no RepCard account, which is not a disagreement.
 */
export function compareToRepCard(app: AppSide, rc: RepCardSide | null): Drift {
  if (!rc) return {};
  // Rule 1: leadership is structurally different, not wrong.
  if (norm(app.role) !== "sales") return {};

  const drift: Drift = {};

  // Rule 3 for Branch, then rule 2 on the normalized values, so legacy text that
  // names no branch reads as "unknown" rather than as a mismatch.
  const appBranch = normalizeBranch(app.branch);
  const rcBranch = normalizeBranch(rc.branch);
  if (appBranch && rcBranch && appBranch !== rcBranch) {
    // Report the raw app value: that is what the admin is looking at on screen.
    drift.branch = { app: app.branch, repcard: rcBranch };
  }

  const appLead = (app.teamLeadName || "").trim();
  const rcLead = (rc.teamLeadName || "").trim();
  if (appLead && rcLead && norm(appLead) !== norm(rcLead)) {
    drift.team = { app: appLead, repcard: rcLead };
  }

  return drift;
}

/** True when there is at least one disagreement worth showing a warning for. */
export function hasDrift(drift: Drift): boolean {
  return !!drift.branch || !!drift.team;
}
