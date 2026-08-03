import { describe, it, expect } from "vitest";
import { resolveScope } from "./resolve";

describe("resolveScope", () => {
  it("sales -> self", () => {
    expect(resolveScope({ id: "u1", role: "sales", name: "Any Rep" })).toEqual({ level: "self", userId: "u1" });
  });
  it("c-level -> company", () => {
    expect(resolveScope({ id: "u2", role: "c-level", name: "Jay" })).toEqual({ level: "company" });
  });
  it("team lead -> team resolved from their name via the org chart", () => {
    // The org chart maps a PERSON's name to their team: "Gunner McCullough" is the
    // first member (lead) of the "Gunner" team. A bare team key is not a person.
    const s = resolveScope({ id: "u3", role: "sales-team-lead", name: "Gunner McCullough" });
    expect(s.level).toBe("team");
    expect(s.team).toBe("Gunner");
  });
  it("branch manager -> branch resolved from their team's branch", () => {
    const s = resolveScope({ id: "u4", role: "branch-manager", name: "Gunner McCullough" });
    expect(s.level).toBe("branch");
    expect(s.branch).toBe("Fort Worth"); // TEAM_BRANCH["Gunner"]
  });
  it("unknown role -> falls back to self, never company (fail closed)", () => {
    expect(resolveScope({ id: "u9", role: "some-new-role", name: "Someone" })).toEqual({ level: "self", userId: "u9" });
  });
  it("team lead not on the org chart -> team null (honest, no silent wrong team)", () => {
    // Documents real behaviour: a lead whose app account name doesn't match the org
    // chart resolves to null rather than guessing. The endpoint/UI must treat a null
    // scope key as "no data to show" instead of silently rolling up the wrong team.
    const s = resolveScope({ id: "u5", role: "sales-team-lead", name: "Nobody Onchart" });
    expect(s.level).toBe("team");
    expect(s.team).toBeNull();
  });
});
