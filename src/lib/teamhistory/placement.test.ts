import { describe, it, expect } from "vitest";
import { placeRep } from "./placement";
import { buildOrgChart } from "../repcard/org-chart";
import { officeToBranch, BRANCH_ORDER } from "../repcard/branches";

const users = [
  { id: "gunner", name: "Gunner McCullough", role: "branch-manager", territory: "Fort Worth" },
  { id: "rep1", name: "Live Rep", role: "sales", managerId: "gunner", territory: "Fort Worth" },
  { id: "gone", name: "Former Rep", role: "sales", managerId: "gunner", territory: "", deleted: true },
  { id: "naaman", name: "Naaman Taylor", role: "c-level", territory: "" },
  { id: "q", name: "Quinton Hill", role: "sales", managerId: "gunner", territory: "" },
];
const org = buildOrgChart(users as any, BRANCH_ORDER, officeToBranch);
const base = { org, appTeamForRepCardTeam: (t: any) => (t === "Gunner" ? "Gunner McCullough" : ""), officeToBranch };
const u = (id: string) => users.find((x) => x.id === id) as any;

describe("placeRep", () => {
  it("a live account decides, whatever RepCard says", () => {
    expect(placeRep({ ...base, live: u("rep1"), repcardTeam: "Cooper" })).toMatchObject({ team: "Gunner McCullough", branch: "Fort Worth" });
  });
  it("a deleted account still places a former rep (deletion is not a move)", () => {
    expect(placeRep({ ...base, former: u("gone") })).toMatchObject({ team: "Gunner McCullough", branch: "Fort Worth" });
  });
  it("non-sales and No Branch accounts get no team, never the RepCard fallback", () => {
    expect(placeRep({ ...base, live: u("naaman"), repcardTeam: "Gunner" })).toMatchObject({ team: "", branch: "" });
    expect(placeRep({ ...base, live: u("q"), repcardTeam: "Gunner" })).toMatchObject({ team: "", branch: "" });
  });
  it("no app account: RepCard team matched to its app team", () => {
    expect(placeRep({ ...base, repcardTeam: "Gunner", repcardOffice: "Dallas Office" })).toMatchObject({ team: "Gunner McCullough", branch: "Fort Worth" });
  });
  it("no app account and no team match: office decides the branch", () => {
    expect(placeRep({ ...base, repcardTeam: "Unknown", repcardOffice: "Dallas Office" })).toMatchObject({ team: "", branch: "Dallas" });
  });
});
