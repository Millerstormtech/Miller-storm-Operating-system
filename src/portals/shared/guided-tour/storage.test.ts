import { describe, it, expect } from "vitest";
import { getSeenVersion, markSeen, shouldAutoStart, type StorageLike } from "./storage";

function fakeStore(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
  };
}

const THROWING: StorageLike = {
  getItem: () => { throw new Error("private mode"); },
  setItem: () => { throw new Error("private mode"); },
};

describe("getSeenVersion", () => {
  it("returns 0 when the key is missing", () => {
    expect(getSeenVersion("sales-leaderboard", "u1", fakeStore())).toBe(0);
  });
  it("reads the stored version", () => {
    const s = fakeStore({ "tourSeen:sales-leaderboard:u1": "3" });
    expect(getSeenVersion("sales-leaderboard", "u1", s)).toBe(3);
  });
  it("returns 0 for a malformed value", () => {
    const s = fakeStore({ "tourSeen:sales-leaderboard:u1": "banana" });
    expect(getSeenVersion("sales-leaderboard", "u1", s)).toBe(0);
  });
  it("keys per user, so one user's state does not leak to another", () => {
    const s = fakeStore({ "tourSeen:sales-leaderboard:u1": "2" });
    expect(getSeenVersion("sales-leaderboard", "u2", s)).toBe(0);
  });
  it("returns 0 when storage throws", () => {
    expect(getSeenVersion("sales-leaderboard", "u1", THROWING)).toBe(0);
  });
  it("returns 0 when there is no store at all", () => {
    expect(getSeenVersion("sales-leaderboard", "u1", null)).toBe(0);
  });
});

describe("markSeen", () => {
  it("writes the version under the per-user key", () => {
    const s = fakeStore();
    markSeen("training-center", "u9", 1, s);
    expect(s.data["tourSeen:training-center:u9"]).toBe("1");
  });
  it("round-trips with getSeenVersion", () => {
    const s = fakeStore();
    markSeen("training-course", "u9", 4, s);
    expect(getSeenVersion("training-course", "u9", s)).toBe(4);
  });
  it("does not throw when storage throws", () => {
    expect(() => markSeen("training-center", "u1", 1, THROWING)).not.toThrow();
  });
});

describe("shouldAutoStart", () => {
  it("starts when never seen", () => {
    expect(shouldAutoStart(0, 1)).toBe(true);
  });
  it("does not start when already seen at the current version", () => {
    expect(shouldAutoStart(1, 1)).toBe(false);
  });
  it("starts again after a version bump", () => {
    expect(shouldAutoStart(1, 2)).toBe(true);
  });
  it("does not start when the stored version is somehow ahead", () => {
    expect(shouldAutoStart(5, 2)).toBe(false);
  });
});
