import { describe, it, expect } from "vitest";
import { resolveAudience, isResolveError, type ResolveAudienceInput, type TeamLeadCandidate } from "./audience";

const leads: TeamLeadCandidate[] = [
  { id: "lead-fw-1", name: "Daniel Sabedra", branches: ["fort worth"] },
  { id: "lead-fw-2", name: "Cooper Bledsoe", branches: ["fort worth", "commercial"] },
  { id: "lead-dal-1", name: "Gunner McCullough", branches: ["dallas"] },
];

function baseInput(role: string, overrides: Partial<ResolveAudienceInput> = {}): ResolveAudienceInput {
  return {
    role,
    callerId: "caller-1",
    callerName: "Caller One",
    callerBranchesRaw: [],
    callerBranchesNorm: [],
    allBranchesRaw: ["Fort Worth", "Dallas", "West Texas", "Commercial"],
    allTeamLeads: leads,
    ...overrides,
  };
}

describe("resolveAudience — admin / c-level", () => {
  it("defaults to everyone with no type given", () => {
    const r = resolveAudience(baseInput("admin"), {});
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) {
      expect(r.label).toBe("Everyone");
      expect(r.filter).toEqual({ deleted: { $ne: true }, suspended: { $ne: true } });
    }
  });

  it("resolves a valid branch pick to the canonical (DB-cased) value", () => {
    const r = resolveAudience(baseInput("c-level"), { type: "branch", branches: ["fort worth"] });
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) {
      expect(r.label).toBe("Branch: Fort Worth");
      expect(r.filter).toMatchObject({
        $or: [{ territory: { $in: ["Fort Worth"] } }, { branches: { $in: ["Fort Worth"] } }],
      });
    }
  });

  it("filters out unknown branches and only keeps real ones", () => {
    const r = resolveAudience(baseInput("admin"), { type: "branch", branches: ["Fort Worth", "Nowhere"] });
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) expect(r.label).toBe("Branch: Fort Worth");
  });

  it("errors when every requested branch is unknown", () => {
    const r = resolveAudience(baseInput("admin"), { type: "branch", branches: ["Nowhere"] });
    expect(isResolveError(r)).toBe(true);
  });

  it("errors when branch type is picked with no branches at all", () => {
    const r = resolveAudience(baseInput("admin"), { type: "branch", branches: [] });
    expect(isResolveError(r)).toBe(true);
  });

  it("resolves a team pick to that lead + their reports", () => {
    const r = resolveAudience(baseInput("c-level"), { type: "team", teamLeadIds: ["lead-dal-1"] });
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) {
      expect(r.label).toBe("Team: Gunner McCullough");
      expect(r.filter).toMatchObject({
        $or: [{ id: { $in: ["lead-dal-1"] } }, { managerId: { $in: ["lead-dal-1"] } }],
      });
    }
  });

  it("can target multiple teams at once, pluralizing the label", () => {
    const r = resolveAudience(baseInput("admin"), { type: "team", teamLeadIds: ["lead-fw-1", "lead-dal-1"] });
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) expect(r.label).toBe("Teams: Daniel Sabedra, Gunner McCullough");
  });

  it("errors on a team pick with an id that doesn't belong to any team lead", () => {
    const r = resolveAudience(baseInput("admin"), { type: "team", teamLeadIds: ["not-a-lead"] });
    expect(isResolveError(r)).toBe(true);
  });
});

describe("resolveAudience — branch-manager", () => {
  const bmInput = (overrides: Partial<ResolveAudienceInput> = {}) =>
    baseInput("branch-manager", {
      callerId: "bm-1",
      callerName: "Branch Manager",
      callerBranchesRaw: ["Fort Worth"],
      callerBranchesNorm: ["fort worth"],
      ...overrides,
    });

  it("errors immediately if the branch-manager has no branch assigned", () => {
    const r = resolveAudience(bmInput({ callerBranchesRaw: [], callerBranchesNorm: [] }), { type: "branch" });
    expect(isResolveError(r)).toBe(true);
  });

  it("'branch' type always resolves to their OWN branch, ignoring any client-sent branches", () => {
    // Even if the request tried to slip in a different branch, the resolver
    // never reads raw.branches for this role at all.
    const r = resolveAudience(bmInput(), { type: "branch", branches: ["Dallas"] } as any);
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) {
      expect(r.label).toBe("Branch: Fort Worth");
      expect(r.filter).toMatchObject({
        $or: [{ territory: { $in: ["Fort Worth"] } }, { branches: { $in: ["Fort Worth"] } }],
      });
    }
  });

  it("can target a team INSIDE their own branch", () => {
    const r = resolveAudience(bmInput(), { type: "team", teamLeadIds: ["lead-fw-1"] });
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) expect(r.label).toBe("Team: Daniel Sabedra");
  });

  it("rejects a team OUTSIDE their own branch, even if explicitly requested", () => {
    const r = resolveAudience(bmInput(), { type: "team", teamLeadIds: ["lead-dal-1"] });
    expect(isResolveError(r)).toBe(true);
  });

  it("keeps only the in-branch teams when a mix of in- and out-of-branch ids is sent", () => {
    const r = resolveAudience(bmInput(), { type: "team", teamLeadIds: ["lead-fw-1", "lead-dal-1"] });
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) expect(r.label).toBe("Team: Daniel Sabedra");
  });

  it("matches a team lead's branch case-insensitively", () => {
    // Lead's own branch list is normalized lowercase; the branch-manager's
    // normalized branches must still match regardless of stored casing.
    const r = resolveAudience(
      bmInput({ callerBranchesRaw: ["FORT WORTH"], callerBranchesNorm: ["fort worth"] }),
      { type: "team", teamLeadIds: ["lead-fw-1"] }
    );
    expect(isResolveError(r)).toBe(false);
  });

  it("a branch-manager can never reach 'everyone' — any other type still resolves to their own branch", () => {
    const r = resolveAudience(bmInput(), { type: "everyone" });
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) expect(r.label).toBe("Branch: Fort Worth");
  });

  it("supports multiple assigned branches at once", () => {
    const r = resolveAudience(
      bmInput({ callerBranchesRaw: ["Fort Worth", "Commercial"], callerBranchesNorm: ["fort worth", "commercial"] }),
      { type: "team", teamLeadIds: ["lead-fw-2"] }
    );
    expect(isResolveError(r)).toBe(false);
    if (!isResolveError(r)) expect(r.label).toBe("Team: Cooper Bledsoe");
  });
});

describe("resolveAudience — sales-team-lead", () => {
  it("is always forced to their own team, regardless of anything in the request", () => {
    const input = baseInput("sales-team-lead", { callerId: "stl-1", callerName: "Team Lead One" });
    const attempts: any[] = [
      {},
      { type: "everyone" },
      { type: "branch", branches: ["Fort Worth"] },
      { type: "team", teamLeadIds: ["lead-dal-1"] },
    ];
    for (const raw of attempts) {
      const r = resolveAudience(input, raw);
      expect(isResolveError(r)).toBe(false);
      if (!isResolveError(r)) {
        expect(r.label).toBe("Team: Team Lead One");
        expect(r.filter).toMatchObject({
          $or: [{ id: { $in: ["stl-1"] } }, { managerId: { $in: ["stl-1"] } }],
        });
      }
    }
  });
});

describe("resolveAudience — every resolved filter excludes deleted/suspended users", () => {
  it("everyone", () => {
    const r = resolveAudience(baseInput("admin"), {});
    if (!isResolveError(r)) expect(r.filter).toMatchObject({ deleted: { $ne: true }, suspended: { $ne: true } });
  });
  it("branch", () => {
    const r = resolveAudience(baseInput("admin"), { type: "branch", branches: ["Dallas"] });
    if (!isResolveError(r)) expect(r.filter).toMatchObject({ deleted: { $ne: true }, suspended: { $ne: true } });
  });
  it("team", () => {
    const r = resolveAudience(baseInput("admin"), { type: "team", teamLeadIds: ["lead-dal-1"] });
    if (!isResolveError(r)) expect(r.filter).toMatchObject({ deleted: { $ne: true }, suspended: { $ne: true } });
  });
});
