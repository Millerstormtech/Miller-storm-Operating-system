import { describe, it, expect } from "vitest";
import { credentialProgress, nextCredential, CREDENTIALS } from "./credentials";
import { TRAINING_CATEGORIES, UNCATEGORIZED_LABEL } from "./categories";
import type { CourseStats } from "./scoring";

const stats = (over: Partial<CourseStats>): CourseStats => ({
  videosWatched: 0,
  videosTotal: 0,
  quizzesPassed: 0,
  quizzesTotal: 0,
  itemsCompleted: 0,
  itemsTotal: 0,
  pct: 0,
  complete: false,
  finalTestPerfect: false,
  started: false,
  ...over,
});

const MSCERT = CREDENTIALS[0].category;
const KNOCKERS = CREDENTIALS[1].category;
const HUSTLERS = CREDENTIALS[2].category;

describe("credentialProgress", () => {
  it("counts each credential against its OWN courses, not the library", () => {
    const courses = [
      { id: "p1", category: MSCERT },
      { id: "p2", category: MSCERT },
      { id: "k1", category: KNOCKERS },
    ];
    const byId = new Map<string, CourseStats>([
      // Miller Storm: 8 of 10 items done.
      ["p1", stats({ itemsCompleted: 5, itemsTotal: 5, complete: true })],
      ["p2", stats({ itemsCompleted: 3, itemsTotal: 5 })],
      // Knockers: untouched.
      ["k1", stats({ itemsCompleted: 0, itemsTotal: 4 })],
    ]);
    const out = credentialProgress(courses, byId);
    expect(out.find((c) => c.key === "certificate")).toMatchObject({ pct: 80, itemsTotal: 10 });
    // 0 of 4, NOT 0 of the 14 items in the library.
    expect(out.find((c) => c.key === "knockers")).toMatchObject({ pct: 0, itemsTotal: 4 });
  });

  it("marks a credential earned only when every course in it is complete", () => {
    const courses = [
      { id: "a", category: HUSTLERS },
      { id: "b", category: HUSTLERS },
    ];
    const partial = new Map<string, CourseStats>([
      ["a", stats({ itemsCompleted: 4, itemsTotal: 4, complete: true })],
      ["b", stats({ itemsCompleted: 1, itemsTotal: 4 })],
    ]);
    expect(credentialProgress(courses, partial).find((c) => c.key === "hustlers")).toMatchObject({
      earned: false,
      coursesCompleted: 1,
      coursesTotal: 2,
    });

    const done = new Map<string, CourseStats>([
      ["a", stats({ itemsCompleted: 4, itemsTotal: 4, complete: true })],
      ["b", stats({ itemsCompleted: 4, itemsTotal: 4, complete: true })],
    ]);
    expect(credentialProgress(courses, done).find((c) => c.key === "hustlers")).toMatchObject({
      earned: true,
      pct: 100,
    });
  });

  it("never reports an empty credential as earned", () => {
    const out = credentialProgress([], new Map());
    expect(out).toHaveLength(3);
    for (const c of out) {
      expect(c).toMatchObject({ pct: 0, earned: false, coursesTotal: 0 });
    }
  });

  it("ignores courses belonging to no credential", () => {
    const courses = [
      { id: "d", category: MSCERT },
      { id: "x", category: "Other Courses" },
      { id: "y" }, // uncategorised
    ];
    const byId = new Map<string, CourseStats>([
      ["d", stats({ itemsCompleted: 2, itemsTotal: 2, complete: true })],
      ["x", stats({ itemsCompleted: 0, itemsTotal: 50 })],
      ["y", stats({ itemsCompleted: 0, itemsTotal: 50 })],
    ]);
    // Miller Storm is complete despite 100 untouched items sitting elsewhere.
    expect(credentialProgress(courses, byId).find((c) => c.key === "certificate")).toMatchObject({
      pct: 100,
      earned: true,
    });
  });

  it("tolerates whitespace around a stored category", () => {
    const courses = [{ id: "d", category: `  ${MSCERT}  ` }];
    const byId = new Map<string, CourseStats>([
      ["d", stats({ itemsCompleted: 1, itemsTotal: 2 })],
    ]);
    expect(credentialProgress(courses, byId).find((c) => c.key === "certificate")).toMatchObject({
      pct: 50,
      coursesTotal: 1,
    });
  });

  it("skips a course with no stats rather than counting it as zero-of-zero", () => {
    const courses = [
      { id: "d", category: MSCERT },
      { id: "missing", category: MSCERT },
    ];
    const byId = new Map<string, CourseStats>([
      ["d", stats({ itemsCompleted: 3, itemsTotal: 3, complete: true })],
    ]);
    const out = credentialProgress(courses, byId).find((c) => c.key === "certificate")!;
    expect(out.itemsTotal).toBe(3);
    // The course still counts toward the roster, so the credential is NOT earned.
    expect(out.coursesTotal).toBe(2);
    expect(out.earned).toBe(false);
  });

  it("always returns the three credentials in row order", () => {
    expect(credentialProgress([], new Map()).map((c) => c.key)).toEqual([
      "certificate",
      "knockers",
      "hustlers",
    ]);
  });
});

describe("nextCredential", () => {
  const prog = (over: Partial<import("./credentials").CredentialProgress> & { key: any }) => ({
    itemsCompleted: 0, itemsTotal: 10, pct: 0, coursesCompleted: 0, coursesTotal: 2, earned: false, ...over,
  });

  it("names the credential closest to done, by percentage", () => {
    expect(
      nextCredential([
        prog({ key: "certificate", pct: 20, coursesCompleted: 0, coursesTotal: 4 }),
        prog({ key: "knockers", pct: 75, coursesCompleted: 0, coursesTotal: 1 }),
        prog({ key: "hustlers", pct: 10, coursesCompleted: 0, coursesTotal: 4 }),
      ])
    ).toBe("Millionaire Knockers (1 course left)");
  });

  it("counts courses remaining, not courses total", () => {
    expect(
      nextCredential([prog({ key: "hustlers", pct: 60, coursesCompleted: 3, coursesTotal: 4 })])
    ).toBe("Roof Hustlers (1 course left)");
  });

  it("skips credentials already earned", () => {
    expect(
      nextCredential([
        prog({ key: "certificate", pct: 100, coursesCompleted: 4, coursesTotal: 4, earned: true }),
        prog({ key: "knockers", pct: 30, coursesCompleted: 0, coursesTotal: 2 }),
      ])
    ).toBe("Millionaire Knockers (2 courses left)");
  });

  it("returns null when everything is earned", () => {
    expect(
      nextCredential([prog({ key: "certificate", pct: 100, coursesCompleted: 2, coursesTotal: 2, earned: true })])
    ).toBeNull();
  });

  it("ignores credentials holding no courses", () => {
    expect(nextCredential([prog({ key: "knockers", coursesTotal: 0, pct: 0 })])).toBeNull();
  });

  it("breaks a tie in row order, so Miller Storm is offered first", () => {
    expect(
      nextCredential([
        prog({ key: "certificate", pct: 50, coursesCompleted: 1, coursesTotal: 2 }),
        prog({ key: "hustlers", pct: 50, coursesCompleted: 1, coursesTotal: 2 }),
      ])
    ).toBe("Miller Storm Certificate (1 course left)");
  });
});

describe("the category strings stay in step with the Course Builder", () => {
  it("offers every credential category as a pick in the Course Builder", () => {
    // This is the invariant that made the 2026-08-19 rename risky. `category`
    // is the ONLY link between a course and its credential, and it is stored on
    // each Course document. If CREDENTIALS and TRAINING_CATEGORIES drift, an
    // admin can no longer pick the category that a credential is looking for,
    // so the credential silently matches nothing and every rep's bar reads 0%
    // with no error anywhere.
    for (const c of CREDENTIALS) {
      expect(TRAINING_CATEGORIES).toContain(c.category);
    }
  });

  it("never lets a credential category collide with the uncategorised bucket", () => {
    for (const c of CREDENTIALS) {
      expect(c.category).not.toBe(UNCATEGORIZED_LABEL);
    }
  });

  it("keeps the word Diploma out of every user-facing name", () => {
    // Jay dropped it on 2026-08-19. The stored category has to match the label
    // it was renamed alongside, so this covers both.
    for (const c of CREDENTIALS) {
      expect(`${c.label} ${c.short} ${c.category}`).not.toMatch(/diploma/i);
    }
  });
});
