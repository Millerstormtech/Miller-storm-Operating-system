import { describe, it, expect, vi, beforeEach } from "vitest";

// Which team a rep shows on each board (decided by Youssef 2026-10-02, MS-027):
//   - Course Leaderboard: the Team Lead on the rep's profile in User Management,
//     and nothing else. No Team Lead means no team; no typed fallback.
//   - Sales Leaderboard (and the dashboards built on it): RepCard's team, as before.
// Both boards' real loaders run here against an in-memory stand-in for the database.
const db = vi.hoisted(() => ({
  users: [] as any[],
  repcardUsers: [] as any[],
  knocks: [] as any[],
}));

const query = (rows: () => any[]) => ({ select: () => ({ lean: async () => rows() }), lean: async () => rows() });
const matchesIn = (row: any, filter: any) =>
  Object.entries(filter).every(([k, v]: [string, any]) =>
    v && typeof v === "object" && "$in" in v ? v.$in.includes(row[k]) : v && typeof v === "object" ? true : row[k] === v
  );

vi.mock("../mongodb", () => ({ connectMongo: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../models/Course", () => ({ CourseModel: { find: () => query(() => []) } }));
vi.mock("../models/UserProgress", () => ({ UserProgressModel: { find: () => query(() => []) } }));
vi.mock("../models/User", () => ({
  UserModel: { find: (filter: any = {}) => query(() => db.users.filter((u) => matchesIn(u, filter))) },
}));
vi.mock("../models/ScoringFact", () => ({ ScoringFactModel: { aggregate: async () => [] } }));
vi.mock("../models/AcculynxUser", () => ({ AcculynxUserModel: { find: () => query(() => []) } }));
vi.mock("../models/RepCardUser", () => ({ RepCardUserModel: { find: () => query(() => db.repcardUsers) } }));
vi.mock("../models/RepCardKnockFact", () => ({
  // Both the all-time knocker query and the in-range one: every rep has knocked.
  RepCardKnockFactModel: {
    aggregate: async (pipeline: any[]) =>
      pipeline.some((s) => s.$group?.k)
        ? db.knocks.map((k) => ({ _id: k.repcardUserId, k: 10 }))
        : db.knocks.map((k) => ({ _id: k.repcardUserId, email: k.email, name: k.name, verifiedKnocks: 10 })),
  },
}));

const { loadBoardData } = await import("./board-data");
const { computeSalesRows } = await import("../leaderboard/compute");

beforeEach(() => {
  db.users = [
    { id: "luke", name: "Luke Huber", email: "luke@x.com", role: "sales-team-lead", managerId: "gunner", territory: "Fort Worth" },
    { id: "cooper", name: "Cooper Bledsoe", email: "cooper@x.com", role: "sales-team-lead", territory: "Dallas" },
    { id: "gunner", name: "Gunner McCullough", email: "gunner@x.com", role: "branch-manager", territory: "Fort Worth" },
    // Moved off Luke's team to Cooper's in User Management.
    { id: "jose", name: "Jose Robles", email: "jose@x.com", role: "sales", managerId: "cooper", territory: "Dallas" },
    // Added to Luke's team in User Management; the roster has never heard of him.
    { id: "james", name: "James Carter", email: "james@x.com", role: "sales", managerId: "luke", territory: "Fort Worth" },
    // No Team Lead set: no team on the Course Leaderboard, whatever RepCard says.
    { id: "alan", name: "Alan Bieberle", email: "alan@x.com", role: "sales", territory: "Fort Worth" },
  ];
  // RepCard still has Jose on Luke's team.
  db.repcardUsers = [
    { repcardUserId: "rc-jose", name: "Jose Robles", email: "jose@x.com", team: "Luke", office: "Fort Worth", status: "ACTIVE" },
    { repcardUserId: "rc-alan", name: "Alan Bieberle", email: "alan@x.com", team: "Gunner", office: "Fort Worth", status: "ACTIVE" },
    { repcardUserId: "rc-james", name: "James Carter", email: "james@x.com", team: "", office: "Fort Worth", status: "ACTIVE" },
  ];
  db.knocks = db.repcardUsers.map((u) => ({ repcardUserId: u.repcardUserId, email: u.email, name: u.name }));
});

const teamsOf = (rows: any[], key: (r: any) => string) => Object.fromEntries(rows.map((r) => [key(r), r.team]));

describe("the Course Leaderboard takes teams from the app profile only", () => {
  it("puts each rep on their Team Lead's team, named by the lead's full name", async () => {
    const { rows } = await loadBoardData();
    expect(teamsOf(rows, (r) => r.name)).toEqual({
      "Luke Huber": "Luke Huber",
      "Cooper Bledsoe": "Cooper Bledsoe",
      "Jose Robles": "Cooper Bledsoe",
      "James Carter": "Luke Huber",
      // RepCard says Gunner, but his profile has no Team Lead.
      "Alan Bieberle": "",
    });
  });

  it("takes the branch from the rep's own territory", async () => {
    const { rows } = await loadBoardData();
    expect(rows.find((r) => r.name === "Jose Robles")!.branch).toBe("Dallas");
    expect(rows.find((r) => r.name === "Alan Bieberle")!.branch).toBe("Fort Worth");
  });
});

describe("the Sales Leaderboard keeps taking teams from RepCard", () => {
  it("follows RepCard even where User Management says otherwise", async () => {
    const rows = await computeSalesRows({ start: new Date("2026-09-01"), end: new Date("2026-09-30") });
    const teams = teamsOf(rows, (r) => r.name);
    expect(teams["Jose Robles"]).toBe("Luke");
    expect(teams["Alan Bieberle"]).toBe("Gunner");
  });
});
