import { describe, it, expect } from "vitest";
import { resolveScope } from "./resolve";

describe("resolveScope", () => {
  it("sales -> self", () => {
    expect(resolveScope({ id: "u1", role: "sales", name: "Any Rep" })).toEqual({ level: "self", userId: "u1" });
  });
  it("c-level -> company", () => {
    expect(resolveScope({ id: "u2", role: "c-level", name: "Jay" })).toEqual({ level: "company" });
  });
  it("team lead -> their own team, named after them like on every board", () => {
    const s = resolveScope({ id: "u3", role: "sales-team-lead", name: "Daniel Reyes" });
    expect(s.level).toBe("team");
    expect(s.team).toBe("Daniel Reyes");
  });
  it("branch manager -> the Branch on their profile", () => {
    const s = resolveScope({ id: "u4", role: "branch-manager", name: "Gunner McCullough", territory: "Fort Worth" });
    expect(s.level).toBe("branch");
    expect(s.branch).toBe("Fort Worth");
  });
  it("branch manager with no Branch on their profile -> branch null (no silent wrong branch)", () => {
    const s = resolveScope({ id: "u6", role: "branch-manager", name: "Dev Manager", territory: "" });
    expect(s.branch).toBeNull();
  });
  it("unknown role -> falls back to self, never company (fail closed)", () => {
    expect(resolveScope({ id: "u9", role: "some-new-role", name: "Someone" })).toEqual({ level: "self", userId: "u9" });
  });
  it("team lead with no name -> team null (honest, no silent wrong team)", () => {
    const s = resolveScope({ id: "u5", role: "sales-team-lead", name: "" });
    expect(s.level).toBe("team");
    expect(s.team).toBeNull();
  });
});
