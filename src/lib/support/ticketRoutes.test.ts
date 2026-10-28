import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { signSession } from "../auth";

// The ticket routes' status and notification rules over real HTTP, against an
// in-memory stand-in for the models. Its save() enforces the schema's status
// enum, so a status the schema refuses would fail here just as it would in Mongo.
const db = vi.hoisted(() => {
  const tickets: any[] = [];
  const users: any[] = [
    { id: "admin1", role: "admin", name: "Ada Admin", email: "ada@example.com", fcmToken: "tok-admin" },
    { id: "rep1", role: "sales", name: "Ray Rep", email: "ray@example.com", fcmToken: "tok-rep" },
    // Handlers listed on the Billing / Draw Request categories.
    { id: "bill1", role: "marketing", name: "Dana Webb", email: "billing@millerstorm.com", fcmToken: "tok-bill" },
    { id: "office1", role: "c-level", name: "Aleiya B", email: "Office@MillerStorm.com" },
    { id: "jay1", role: "c-level", name: "Jay Miller", email: "jaymiller@millerstorm.com", fcmToken: "tok-jay" },
    { id: "gone1", role: "c-level", name: "Old Naaman", email: "naaman@millerstorm.com", deleted: true },
    // Handles Tech tickets only.
    { id: "tech1", role: "c-level", name: "Tech Desk", email: "tech@millerstorm.com" },
  ];
  // Enough of Mongo's query language for these routes: equality, $ne, $in,
  // $nin, $or and case-insensitive $regex.
  const test = (val: any, cond: any): boolean => {
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if ("$ne" in cond) return val !== cond.$ne;
      if ("$in" in cond) return cond.$in.includes(val);
      if ("$nin" in cond) return !cond.$nin.includes(val);
      if ("$regex" in cond) return new RegExp(cond.$regex, cond.$options).test(val ?? "");
    }
    return val === cond;
  };
  const matches = (row: any, f: Record<string, any>): boolean =>
    Object.entries(f).every(([k, v]) => (k === "$or" ? v.some((sub: any) => matches(row, sub)) : test(row[k], v)));
  const copy = (x: any) => JSON.parse(JSON.stringify(x));
  const makeDoc = (row: any) => {
    const doc = copy(row);
    Object.defineProperty(doc, "save", {
      value: async () => {
        if (!["open", "in_progress", "approved", "rejected", "completed"].includes(doc.status)) throw new Error(`\`${doc.status}\` is not a valid enum value for path \`status\``);
        for (const k of Object.keys(row)) delete row[k];
        Object.assign(row, copy(doc));
      },
    });
    Object.defineProperty(doc, "toObject", { value: () => copy(doc) });
    return doc;
  };
  const one = (row: any) => ({
    lean: async () => (row ? copy(row) : null),
    then: (res: any, rej: any) => Promise.resolve(row ? makeDoc(row) : null).then(res, rej),
  });
  const TicketModel = {
    findOne: (f: any) => one(tickets.find((t) => matches(t, f))),
    find: (f: any = {}) => ({ sort: () => ({ lean: async () => tickets.filter((t) => matches(t, f)).map(copy) }) }),
    countDocuments: async (f: any) => tickets.filter((t) => matches(t, f)).length,
    updateOne: async (f: any, u: any) => { const t = tickets.find((x) => matches(x, f)); if (t) Object.assign(t, u.$set ?? u); },
    updateMany: vi.fn(async (f: any, u: any) => { tickets.filter((x) => matches(x, f)).forEach((t) => Object.assign(t, u.$set ?? u)); }),
    create: async (row: any) => { tickets.push(copy({ ...row, createdAt: new Date().toISOString() })); return copy(row); },
  };
  const UserModel = {
    findOne: (f: any) => ({ lean: async () => users.find((u) => matches(u, { id: f.id })) ?? null }),
    find: (f: any = {}) => ({ lean: async () => users.filter((u) => matches(u, f)).map(copy) }),
  };
  return { tickets, users, TicketModel, UserModel };
});

const email = vi.hoisted(() => ({
  sendTicketStatusEmail: vi.fn(async () => {}),
  sendTicketStatusStaffEmail: vi.fn(async () => {}),
  sendSupportTicketCreatedEmail: vi.fn(async () => {}),
}));
const notify = vi.hoisted(() => ({ create: vi.fn(async () => ({})) }));
const push = vi.hoisted(() => ({ sendPushNotification: vi.fn(async () => {}) }));

vi.mock("../mongodb", () => ({ connectMongo: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../models/Ticket", () => ({ TicketModel: db.TicketModel }));
vi.mock("../models/User", () => ({ UserModel: db.UserModel }));
vi.mock("../models/Notification", () => ({ NotificationModel: notify }));
vi.mock("../email", () => email);
vi.mock("../firebase-admin", () => push);
vi.mock("./ticketNumber", () => ({ ticketNumberFor: vi.fn(async () => 1), ticketNumbers: vi.fn(async () => new Map()) }));
vi.mock("../leaderboard/compute", () => ({ computeSalesRows: vi.fn(async () => []) }));
vi.mock("../leaderboard/identity", () => ({ findSubmitterRow: vi.fn(() => null) }));

const listHandler = (await import("../../../pages/api/tickets/index")).default;
const ticketHandler = (await import("../../../pages/api/tickets/[id]")).default;

const server = http.createServer(async (req, res) => {
  const shimmed = res as any;
  shimmed.status = (code: number) => { res.statusCode = code; return shimmed; };
  shimmed.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
  let raw = "";
  for await (const chunk of req) raw += chunk;
  (req as any).body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url || "", "http://x");
  (req as any).query = Object.fromEntries(url.searchParams);
  const m = /^\/api\/tickets\/([^/]+)$/.exec(url.pathname);
  if (m) { (req as any).query.id = m[1]; return (ticketHandler as any)(req, shimmed); }
  return (listHandler as any)(req, shimmed);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

type Who = "admin1" | "rep1" | "bill1" | "jay1" | "tech1";
async function call(method: string, path: string, as: Who, body?: unknown) {
  const role = db.users.find((u) => u.id === as)!.role;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${signSession({ id: as, role })}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const reply = (id: string, as: Who) => call("POST", `/api/tickets/${id}`, as, { text: "hello" });
const setStatus = (id: string, as: Who, status: string, adminNote?: string) => call("PATCH", `/api/tickets/${id}`, as, { status, adminNote });
const stored = (id: string) => db.tickets.find((t) => t.id === id);
const ticket = (id: string, status: string, type = "billing") => ({
  id, userId: "rep1", name: "Ray Rep", email: "ray@example.com", role: "sales", type, note: "help", status, messages: [],
  fields: { acculynxJob: "D-2771", amount: "$4,000" }, createdAt: new Date().toISOString(),
});
// Who got an app alert / a push / an email, from the mocks' recorded calls.
const alerted = () => notify.create.mock.calls.map((c: any[]) => c[0].userId).sort();
const pushed = () => push.sendPushNotification.mock.calls.map((c: any[]) => c[0]).sort();
const staffEmailed = () => email.sendTicketStatusStaffEmail.mock.calls.map((c: any[]) => c[0].to).sort();

beforeEach(() => {
  db.tickets.length = 0;
  vi.clearAllMocks();
});

describe("status changes by themselves", () => {
  it("a handler replying on an open ticket moves it to in progress, without a separate status email", async () => {
    db.tickets.push(ticket("t1", "open"));
    const r = await reply("t1", "admin1");
    expect(r.status).toBe(200);
    expect(r.data.status).toBe("in_progress");
    expect(stored("t1").status).toBe("in_progress");
    expect(email.sendTicketStatusEmail).not.toHaveBeenCalled();
  });

  it("the raiser adding details to their own open ticket leaves it open", async () => {
    db.tickets.push(ticket("t1", "open"));
    expect((await reply("t1", "rep1")).data.status).toBe("open");
  });

  it("the raiser writing again on a completed ticket reopens it as in progress", async () => {
    db.tickets.push(ticket("t1", "completed"));
    expect((await reply("t1", "rep1")).data.status).toBe("in_progress");
  });

  it("a handler's follow-up on a completed ticket leaves it completed", async () => {
    db.tickets.push(ticket("t1", "completed"));
    expect((await reply("t1", "admin1")).data.status).toBe("completed");
  });

  it("a chat message never undoes an approval or a rejection", async () => {
    db.tickets.push(ticket("a", "approved", "draw_request"), ticket("r", "rejected"));
    expect((await reply("a", "rep1")).data.status).toBe("approved");
    expect((await reply("a", "bill1")).data.status).toBe("approved");
    expect((await reply("r", "rep1")).data.status).toBe("rejected");
    expect(stored("a").status).toBe("approved");
    expect(stored("r").status).toBe("rejected");
  });
});

describe("chat messages notify in the app, never by email", () => {
  it("a handler's reply gives the raiser an app alert and a phone notification", async () => {
    db.tickets.push(ticket("t1", "open"));
    await reply("t1", "bill1");
    expect(alerted()).toEqual(["rep1"]);
    expect(pushed()).toEqual(["tok-rep"]);
    expect(email.sendTicketStatusEmail).not.toHaveBeenCalled();
    expect(email.sendTicketStatusStaffEmail).not.toHaveBeenCalled();
  });

  it("the raiser's reply alerts every admin and the type's own people, not other types' handlers or deleted accounts", async () => {
    db.tickets.push(ticket("t1", "open", "draw_request"));
    await reply("t1", "rep1");
    // Draw Request lists billing@, office@, Naaman (deleted here) and Jay.
    expect(alerted()).toEqual(["admin1", "bill1", "jay1", "office1"]);
    expect(pushed()).toEqual(["tok-admin", "tok-bill", "tok-jay"]);
  });

  it("the handler who writes is not alerted about their own message", async () => {
    db.tickets.push({ ...ticket("t1", "open"), userId: "bill1" });
    await reply("t1", "bill1");
    expect(alerted()).not.toContain("bill1");
  });
});

describe("a new ticket", () => {
  it("alerts every admin and the type's own people in the app, as well as by email", async () => {
    const r = await call("POST", "/api/tickets", "rep1", { name: "Ray Rep", email: "ray@example.com", type: "billing", note: "commission is short", fields: { acculynxJob: "1" } });
    expect(r.status).toBe(201);
    // Billing lists billing@, office@ and mo@ (no account here).
    expect(alerted()).toEqual(["admin1", "bill1", "office1"]);
    expect(pushed()).toEqual(["tok-admin", "tok-bill"]);
    const emailed = email.sendSupportTicketCreatedEmail.mock.calls.map((c: any[]) => c[0].adminEmail).sort();
    expect(emailed).toEqual(["ada@example.com", "billing@millerstorm.com", "mo@millerstorm.com", "office@millerstorm.com"]);
  });
});

describe("old decisions on types without them", () => {
  it("an old approved Tech ticket still takes replies, and reads as in progress", async () => {
    db.tickets.push(ticket("t1", "approved", "tech"));
    expect((await call("GET", "/api/tickets/t1", "rep1")).data.status).toBe("in_progress");
    const r = await reply("t1", "admin1");
    expect(r.status).toBe(200);
    expect(stored("t1").status).toBe("in_progress");
  });

  it("an old rejected Tech ticket reads as completed, and reopens if the raiser writes again", async () => {
    db.tickets.push(ticket("t1", "rejected", "tech"));
    expect((await call("GET", "/api/tickets/t1", "admin1")).data.status).toBe("completed");
    expect((await reply("t1", "rep1")).data.status).toBe("in_progress");
  });

  it("the ticket list rewrites old decisions on other types, and leaves Billing and Draw Request decisions alone", async () => {
    db.tickets.push(
      ticket("a", "approved", "tech"), ticket("b", "rejected", "msrr_tools"), ticket("c", "open", "tech"),
      ticket("d", "approved", "draw_request"), ticket("e", "rejected", "billing"),
    );
    const r = await call("GET", "/api/tickets", "admin1");
    expect(r.status).toBe(200);
    expect(Object.fromEntries(r.data.map((t: any) => [t.id, t.status]))).toEqual({ a: "in_progress", b: "completed", c: "open", d: "approved", e: "rejected" });
    expect(stored("a").status).toBe("in_progress");
    expect(stored("b").status).toBe("completed");
    expect(stored("d").status).toBe("approved");
    expect(stored("e").status).toBe("rejected");
  });
});

describe("changing the status by hand", () => {
  it("offers Approved and Rejected only on Billing and Draw Request tickets", async () => {
    db.tickets.push(ticket("tech", "open", "tech"), ticket("bill", "open"), ticket("draw", "open", "draw_request"));
    expect((await setStatus("tech", "admin1", "approved")).status).toBe(400);
    expect((await setStatus("tech", "admin1", "rejected")).status).toBe(400);
    expect((await setStatus("tech", "admin1", "completed")).status).toBe(200);
    expect((await setStatus("bill", "admin1", "approved")).status).toBe(200);
    expect((await setStatus("draw", "admin1", "rejected")).status).toBe(200);
    expect((await setStatus("draw", "admin1", "paid")).status).toBe(400);
  });

  it("approving a draw request tells the rep by email, app alert and phone, and emails the whole submission list", async () => {
    db.tickets.push(ticket("t1", "in_progress", "draw_request"));
    const r = await setStatus("t1", "jay1", "approved");
    expect(r.status).toBe(200);
    expect(stored("t1").status).toBe("approved");
    expect(email.sendTicketStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "approved", email: "ray@example.com", type: "Draw Request", decidedBy: "Jay Miller" }));
    expect(alerted()).toEqual(["rep1"]);
    expect(pushed()).toEqual(["tok-rep"]);
    // Draw Request's list plus every admin, one email per address.
    expect(staffEmailed()).toEqual(["ada@example.com", "billing@millerstorm.com", "jaymiller@millerstorm.com", "naaman@millerstorm.com", "office@millerstorm.com"]);
    expect(email.sendTicketStatusStaffEmail).toHaveBeenCalledWith(expect.objectContaining({
      status: "Approved", decidedBy: "Jay Miller", userName: "Ray Rep", details: "Acculynx Job#: D-2771, Amount: $4,000",
    }));
  });

  it("a rejection carries its optional reason to the rep and the staff email, and keeps it on the ticket", async () => {
    db.tickets.push(ticket("t1", "open"));
    await setStatus("t1", "bill1", "rejected", "  Job not closed yet  ");
    expect(stored("t1").status).toBe("rejected");
    expect(stored("t1").adminNote).toBe("Job not closed yet");
    expect(email.sendTicketStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected", adminNote: "Job not closed yet" }));
    expect(email.sendTicketStatusStaffEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "Rejected", adminNote: "Job not closed yet" }));
    expect(notify.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "rep1", message: expect.stringContaining("Reason: Job not closed yet") }));
  });

  it("a rejection without a reason sends no reason", async () => {
    db.tickets.push(ticket("t1", "open"));
    await setStatus("t1", "bill1", "rejected");
    expect(email.sendTicketStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ adminNote: "" }));
  });

  it("marking an approved Billing ticket completed tells the rep and the submission list", async () => {
    db.tickets.push(ticket("t1", "approved"));
    await setStatus("t1", "bill1", "completed");
    expect(email.sendTicketStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(staffEmailed()).toEqual(["ada@example.com", "billing@millerstorm.com", "mo@millerstorm.com", "office@millerstorm.com"]);
  });

  it("In Progress by hand tells only the rep", async () => {
    db.tickets.push(ticket("t1", "open"));
    await setStatus("t1", "bill1", "in_progress");
    expect(email.sendTicketStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress" }));
    expect(email.sendTicketStatusStaffEmail).not.toHaveBeenCalled();
  });

  it("completing a Tech ticket emails only the rep", async () => {
    db.tickets.push(ticket("t1", "in_progress", "tech"));
    await setStatus("t1", "tech1", "completed");
    expect(email.sendTicketStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(email.sendTicketStatusStaffEmail).not.toHaveBeenCalled();
  });

  it("picking the status a ticket already has notifies nobody", async () => {
    db.tickets.push(ticket("t1", "approved"));
    expect((await setStatus("t1", "bill1", "approved")).status).toBe(200);
    expect(email.sendTicketStatusEmail).not.toHaveBeenCalled();
    expect(email.sendTicketStatusStaffEmail).not.toHaveBeenCalled();
    expect(notify.create).not.toHaveBeenCalled();
  });

  it("anyone who handles the type can decide; nobody else can", async () => {
    db.tickets.push(ticket("t1", "open", "draw_request"));
    expect((await setStatus("t1", "rep1", "approved")).status).toBe(403);
    expect((await setStatus("t1", "tech1", "approved")).status).toBe(403);
    expect((await setStatus("t1", "bill1", "approved")).status).toBe(200);
    expect((await setStatus("t1", "jay1", "rejected")).status).toBe(200);
    expect((await setStatus("t1", "admin1", "completed")).status).toBe(200);
  });
});
