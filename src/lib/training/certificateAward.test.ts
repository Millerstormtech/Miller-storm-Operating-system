import { describe, it, expect } from "vitest";
import { newlyEarned, certificateDate } from "./certificateAward";
import type { CredentialProgress } from "./credentials";

const prog = (key: any, earned: boolean): CredentialProgress => ({
  key,
  itemsCompleted: earned ? 10 : 3,
  itemsTotal: 10,
  pct: earned ? 100 : 30,
  coursesCompleted: earned ? 2 : 1,
  coursesTotal: 2,
  earned,
});

describe("newlyEarned", () => {
  it("names only the credential that flipped on THIS save", () => {
    const before = [prog("certificate", false), prog("knockers", false)];
    const after = [prog("certificate", true), prog("knockers", false)];
    expect(newlyEarned(before, after)).toEqual(["certificate"]);
  });

  it("stays silent when a credential was already earned", () => {
    // Re-watching a lesson inside a finished credential must not reissue it.
    const before = [prog("certificate", true)];
    const after = [prog("certificate", true)];
    expect(newlyEarned(before, after)).toEqual([]);
  });

  it("stays silent when nothing is earned yet", () => {
    expect(newlyEarned([prog("hustlers", false)], [prog("hustlers", false)])).toEqual([]);
  });

  it("can report two at once", () => {
    // A single course could be the last one in two credentials if an admin
    // ever files it under both, and a rep is owed both certificates.
    const before = [prog("certificate", false), prog("hustlers", false)];
    const after = [prog("certificate", true), prog("hustlers", true)];
    expect(newlyEarned(before, after)).toEqual(["certificate", "hustlers"]);
  });

  it("treats a credential missing from the before snapshot as newly earned", () => {
    // A credential added to the system after a rep already finished its courses
    // should still issue, rather than being silently skipped forever.
    expect(newlyEarned([], [prog("knockers", true)])).toEqual(["knockers"]);
  });

  it("never reports an unearned credential, whatever the before state", () => {
    expect(newlyEarned([prog("certificate", true)], [prog("certificate", false)])).toEqual([]);
  });
});

describe("certificateDate", () => {
  it("formats the way the sheet prints it", () => {
    expect(certificateDate(new Date(Date.UTC(2026, 7, 19)))).toBe("19 August 2026");
    expect(certificateDate(new Date(Date.UTC(2026, 0, 1)))).toBe("1 January 2026");
    expect(certificateDate(new Date(Date.UTC(2027, 11, 31)))).toBe("31 December 2027");
  });

  it("reads the date in UTC, not the server's zone", () => {
    // The dev machine is UTC+03:00 and the server is elsewhere again. A local
    // read would print the wrong day either side of midnight.
    expect(certificateDate(new Date("2026-08-19T23:30:00Z"))).toBe("19 August 2026");
  });
});
