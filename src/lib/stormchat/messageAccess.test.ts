import { describe, it, expect, vi } from "vitest";

// Mongo ids as group.members / dmKey store them; app ids as the session carries.
const REP1 = { app: "user-rep1", _id: "aaaaaaaaaaaaaaaaaaaaaaa1" };
const REP2 = { app: "user-rep2", _id: "aaaaaaaaaaaaaaaaaaaaaaa2" };
const REP3 = { app: "user-rep3", _id: "aaaaaaaaaaaaaaaaaaaaaaa3" };
const ADMIN = { app: "user-admin", _id: "aaaaaaaaaaaaaaaaaaaaaaa4" };

const db = vi.hoisted(() => {
  const DM = "bbbbbbbbbbbbbbbbbbbbbbb1";
  const LEADS = "bbbbbbbbbbbbbbbbbbbbbbb2";
  const groups: Record<string, any> = {
    [DM]: { _id: DM, isDirect: true, dmKey: "aaaaaaaaaaaaaaaaaaaaaaa1__aaaaaaaaaaaaaaaaaaaaaaa2", members: [] },
    [LEADS]: { _id: LEADS, name: "Leads", visibility: "private", members: ["aaaaaaaaaaaaaaaaaaaaaaa1"] },
  };
  const messages: Record<string, any> = {
    ccccccccccccccccccccccc1: { _id: "ccccccccccccccccccccccc1", groupId: DM, message: "hey rep2 (private DM)" },
    ccccccccccccccccccccccc2: { _id: "ccccccccccccccccccccccc2", groupId: LEADS, message: "leads only" },
    ccccccccccccccccccccccc3: { _id: "ccccccccccccccccccccccc3", groupId: "bbbbbbbbbbbbbbbbbbbbbbb9", message: "group gone" },
  };
  const appToMongo: Record<string, string> = {
    "user-rep1": "aaaaaaaaaaaaaaaaaaaaaaa1",
    "user-rep2": "aaaaaaaaaaaaaaaaaaaaaaa2",
    "user-rep3": "aaaaaaaaaaaaaaaaaaaaaaa3",
    "user-admin": "aaaaaaaaaaaaaaaaaaaaaaa4",
  };
  return { groups, messages, appToMongo };
});

vi.mock("../models/ChatMessage", () => ({
  default: { findById: async (id: string) => db.messages[id] ?? null },
}));
vi.mock("../models/ChatGroup", () => ({
  default: { findById: (id: string) => ({ lean: async () => db.groups[id] ?? null }) },
}));
vi.mock("./appIds", () => ({
  mongoIdForAppId: async (appId: string) => db.appToMongo[appId] ?? null,
}));

const { findReadableMessage } = await import("./messageAccess");

const DM_MSG = "ccccccccccccccccccccccc1";
const LEADS_MSG = "ccccccccccccccccccccccc2";

describe("findReadableMessage (reactions and poll votes)", () => {
  it("returns a DM message to both participants", async () => {
    expect(await findReadableMessage(DM_MSG, { sub: REP1.app, role: "sales" })).not.toBeNull();
    expect(await findReadableMessage(DM_MSG, { sub: REP2.app, role: "sales" })).not.toBeNull();
  });

  it("hides a DM message from a third person: the leak found 2026-10-15", async () => {
    expect(await findReadableMessage(DM_MSG, { sub: REP3.app, role: "sales" })).toBeNull();
  });

  it("hides a DM message from an admin too (no admin override on DMs)", async () => {
    expect(await findReadableMessage(DM_MSG, { sub: ADMIN.app, role: "admin" })).toBeNull();
  });

  it("private group: members yes, outsiders no, system admin yes", async () => {
    expect(await findReadableMessage(LEADS_MSG, { sub: REP1.app, role: "sales" })).not.toBeNull();
    expect(await findReadableMessage(LEADS_MSG, { sub: REP3.app, role: "sales" })).toBeNull();
    expect(await findReadableMessage(LEADS_MSG, { sub: ADMIN.app, role: "admin" })).not.toBeNull();
  });

  it("returns null for a message whose group no longer exists", async () => {
    expect(await findReadableMessage("ccccccccccccccccccccccc3", { sub: REP1.app, role: "admin" })).toBeNull();
  });

  it("returns null (not a crash) for a missing, malformed or non-string id", async () => {
    expect(await findReadableMessage("ccccccccccccccccccccccc9", { sub: REP1.app })).toBeNull();
    expect(await findReadableMessage("not-an-id", { sub: REP1.app })).toBeNull();
    expect(await findReadableMessage({ $ne: null }, { sub: REP1.app })).toBeNull();
    expect(await findReadableMessage(undefined, { sub: REP1.app })).toBeNull();
  });
});
