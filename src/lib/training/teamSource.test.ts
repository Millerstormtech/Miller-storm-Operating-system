import { describe, it, expect, vi, beforeEach } from "vitest";

// Which team a rep shows on each board (decided by Youssef 2026-10-02, MS-027 and
// follow-up): the org chart in User Management decides on EVERY board. A rep is
// on their Team Lead's team, a lead on their own, no Team Lead means no team, and
// there is no typed fallback list. RepCard only places reps who knock in RepCard
// but have no app account yet. Both boards' real loaders run here against an
// in-memory stand-in for the database.
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
vi.mock("../models/RepTeamHistory", () => ({ RepTeamHistoryModel: { find: () => query(() => []) } }));
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
  // RepCard still has Jose on Luke's team. Martin knocks in RepCard on Cooper's
  // team but has no app account yet.
  db.repcardUsers = [
    { repcardUserId: "rc-martin", name: "Martin Ramirez", email: "martin@x.com", team: "Cooper", office: "Fort Worth Office", status: "ACTIVE" },
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
      // Branch managers are on the board since 2026-10-07, on their own team
      // like a team lead.
      "Gunner McCullough": "Gunner McCullough",
    });
  });

  it("tracks team leads and branch managers on videos only, reps on both", async () => {
    const { rows } = await loadBoardData();
    const only = Object.fromEntries(rows.map((r) => [r.name, r.videosOnly]));
    expect(only["Gunner McCullough"]).toBe(true);
    expect(only["Luke Huber"]).toBe(true);
    expect(only["Jose Robles"]).toBe(false);
  });

  it("takes the branch from the rep's own territory", async () => {
    const { rows } = await loadBoardData();
    expect(rows.find((r) => r.name === "Jose Robles")!.branch).toBe("Dallas");
    expect(rows.find((r) => r.name === "Alan Bieberle")!.branch).toBe("Fort Worth");
  });
});

describe("the Sales Leaderboard takes teams from the app profile too", () => {
  const load = () => computeSalesRows({ start: new Date("2026-09-01"), end: new Date("2026-09-30") });

  it("follows User Management even where RepCard says otherwise", async () => {
    const teams = teamsOf(await load(), (r) => r.name);
    expect(teams["Jose Robles"]).toBe("Cooper Bledsoe"); // RepCard: Luke
    expect(teams["James Carter"]).toBe("Luke Huber"); // RepCard: no team
  });

  it("gives an app user with no Team Lead no team, whatever RepCard says", async () => {
    const teams = teamsOf(await load(), (r) => r.name);
    expect(teams["Alan Bieberle"]).toBeNull(); // RepCard: Gunner
  });

  it("takes the branch from the app profile", async () => {
    const rows = await load();
    expect(rows.find((r) => r.name === "Jose Robles")!.branch).toBe("Dallas"); // RepCard office: Fort Worth
  });

  it("places a rep with no app account through their RepCard team", async () => {
    const martin = (await load()).find((r) => r.name === "Martin Ramirez")!;
    expect(martin.team).toBe("Cooper Bledsoe");
    // The matched team's branch, not his RepCard office.
    expect(martin.branch).toBe("Dallas");
    expect(martin.isTeamLead).toBe(false);
  });
});
