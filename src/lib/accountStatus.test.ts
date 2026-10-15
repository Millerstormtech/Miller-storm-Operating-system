import { describe, it, expect, beforeEach } from "vitest";
import {
  isAccountBlocked, refreshIfStale, syncAccount, setAccountState, isBlockedRow, __setAccountLoadersForTests,
} from "./accountStatus";
import { signSession, getAuthUser } from "./auth";

// Stand-in "database" of accounts.
let db: Record<string, { id: string; role?: string; deleted?: boolean; suspended?: boolean; deletionRequested?: boolean }>;
const install = () => __setAccountLoadersForTests(
  async () => Object.values(db),
  async (id) => db[id] ?? null,
);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  db = {
    "user-ok": { id: "user-ok", role: "sales" },
    "user-fired": { id: "user-fired", deleted: true },
    "user-susp": { id: "user-susp", suspended: true },
    "user-leaving": { id: "user-leaving", deletionRequested: true },
  };
  install();
});

describe("isBlockedRow", () => {
  it("blocks deleted, suspended, awaiting deletion, and missing accounts", () => {
    expect(isBlockedRow({ deleted: true })).toBe(true);
    expect(isBlockedRow({ suspended: true })).toBe(true);
    expect(isBlockedRow({ deletionRequested: true })).toBe(true);
    expect(isBlockedRow(null)).toBe(true);
    expect(isBlockedRow({})).toBe(false);
  });
});

describe("blocked-accounts list", () => {
  it("blocks the right accounts once loaded", async () => {
    await refreshIfStale();
    expect(isAccountBlocked("user-ok")).toBe(false);
    expect(isAccountBlocked("user-fired")).toBe(true);
    expect(isAccountBlocked("user-susp")).toBe(true);
    expect(isAccountBlocked("user-leaving")).toBe(true);
  });

  it("an admin suspending someone takes effect on the next request (syncAccount)", async () => {
    await refreshIfStale();
    expect(isAccountBlocked("user-ok")).toBe(false);
    db["user-ok"].suspended = true;
    await syncAccount("user-ok");
    expect(isAccountBlocked("user-ok")).toBe(true);
    db["user-ok"].suspended = false;
    await syncAccount("user-ok");
    expect(isAccountBlocked("user-ok")).toBe(false);
  });

  it("an account erased from the database is blocked after one lookup", async () => {
    await refreshIfStale();
    delete db["user-ok"];
    setAccountState("user-ok", false); // still listed active from the last load
    await syncAccount("user-ok");
    expect(isAccountBlocked("user-ok")).toBe(true);
  });

  it("an account erased between two full reloads is blocked straight after the reload", async () => {
    await refreshIfStale();
    expect(isAccountBlocked("user-ok")).toBe(false);
    delete db["user-ok"];
    await refreshIfStale(Date.now() + 61_000);
    expect(isAccountBlocked("user-ok")).toBe(true);
  });

  it("an id never seen is let through once, then decided", async () => {
    await refreshIfStale();
    db["user-new"] = { id: "user-new" };
    expect(isAccountBlocked("user-new")).toBe(false); // new hire created after the load
    await flush();
    expect(isAccountBlocked("user-new")).toBe(false);
    expect(isAccountBlocked("user-ghost")).toBe(false); // first sight, looked up in background
    await flush();
    expect(isAccountBlocked("user-ghost")).toBe(true); // not in the database
  });
});

describe("getAuthUser honours the list (every route's login check)", () => {
  const reqWith = (token: string) => ({ headers: { authorization: `Bearer ${token}` }, cookies: {} }) as any;

  it("a valid token for an active account works", async () => {
    await refreshIfStale();
    expect(getAuthUser(reqWith(signSession({ id: "user-ok", role: "sales" })))?.sub).toBe("user-ok");
  });

  it("a demoted account gets its CURRENT role, not the token's", async () => {
    await refreshIfStale();
    // Token issued while they were admin; the account is a rep now.
    expect(getAuthUser(reqWith(signSession({ id: "user-ok", role: "admin" })))?.role).toBe("sales");
  });

  it("a role change made by an admin applies on the next request", async () => {
    await refreshIfStale();
    db["user-ok"].role = "sales-team-lead";
    await syncAccount("user-ok");
    expect(getAuthUser(reqWith(signSession({ id: "user-ok", role: "sales" })))?.role).toBe("sales-team-lead");
  });

  it("an account not loaded yet keeps the token's role", () => {
    expect(getAuthUser(reqWith(signSession({ id: "user-unknown", role: "sales" })))?.role).toBe("sales");
  });

  it("a still-valid token for a fired or suspended account is refused", async () => {
    await refreshIfStale();
    expect(getAuthUser(reqWith(signSession({ id: "user-fired", role: "sales" })))).toBeNull();
    expect(getAuthUser(reqWith(signSession({ id: "user-susp", role: "admin" })))).toBeNull();
  });
});
