import { describe, it, expect, vi, beforeEach } from "vitest";

// Which team a rep shows on the course leaderboard and the sales leaderboard:
// the team lead assigned in User Management wins over RepCard and the
// hand-kept roster. Both boards' real loaders run here against an in-memory
// stand-in for the database.
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
    { id: "luke", name: "Luke Huber", email: "luke@x.com", role: "sales-team-lead", managerId: "gunner" },
    { id: "cooper", name: "Cooper Bledsoe", email: "cooper@x.com", role: "sales-team-lead" },
    { id: "gunner", name: "Gunner McCullough", email: "gunner@x.com", role: "branch-manager", roles: ["sales-team-lead"] },
    // Moved off Luke's team to Cooper's in User Management.
    { id: "jose", name: "Jose Robles", email: "jose@x.com", role: "sales", managerId: "cooper" },
    // Added to Luke's team in User Management; the roster has never heard of him.
    { id: "james", name: "James Carter", email: "james@x.com", role: "sales", managerId: "luke" },
    // No team lead set: falls back to RepCard / the roster as before.
    { id: "alan", name: "Alan Bieberle", email: "alan@x.com", role: "sales" },
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

describe("a rep's team follows their team lead in User Management", () => {
  it("on the course leaderboard", async () => {
    const { rows } = await loadBoardData();
    expect(teamsOf(rows, (r) => r.name)).toEqual({
      "Luke Huber": "Luke",
      "Cooper Bledsoe": "Cooper",
      "Jose Robles": "Cooper",
      "James Carter": "Luke",
      "Alan Bieberle": "Gunner",
    });
    expect(rows.find((r) => r.name === "Jose Robles")!.branch).toBe("Dallas");
  });

  it("on the sales leaderboard, even where RepCard still says otherwise", async () => {
    const rows = await computeSalesRows({ start: new Date("2026-09-01"), end: new Date("2026-09-30") });
    expect(teamsOf(rows, (r) => r.name)).toEqual({
      "Jose Robles": "Cooper",
      "James Carter": "Luke",
      "Alan Bieberle": "Gunner",
    });
    expect(rows.find((r) => r.name === "Jose Robles")!.branch).toBe("Dallas");
  });
});
