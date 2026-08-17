import { describe, it, expect } from "vitest";
import { credentialProgress, CREDENTIALS } from "./credentials";
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

const DIPLOMA = CREDENTIALS[0].category;
const KNOCKERS = CREDENTIALS[1].category;
const HUSTLERS = CREDENTIALS[2].category;

describe("credentialProgress", () => {
  it("counts each credential against its OWN courses, not the library", () => {
    const courses = [
      { id: "p1", category: DIPLOMA },
      { id: "p2", category: DIPLOMA },
      { id: "k1", category: KNOCKERS },
    ];
    const byId = new Map<string, CourseStats>([
      // Diploma: 8 of 10 items done.
      ["p1", stats({ itemsCompleted: 5, itemsTotal: 5, complete: true })],
      ["p2", stats({ itemsCompleted: 3, itemsTotal: 5 })],
      // Knockers: untouched.
      ["k1", stats({ itemsCompleted: 0, itemsTotal: 4 })],
    ]);
    const out = credentialProgress(courses, byId);
    expect(out.find((c) => c.key === "diploma")).toMatchObject({ pct: 80, itemsTotal: 10 });
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
      { id: "d", category: DIPLOMA },
      { id: "x", category: "Other Courses" },
      { id: "y" }, // uncategorised
    ];
    const byId = new Map<string, CourseStats>([
      ["d", stats({ itemsCompleted: 2, itemsTotal: 2, complete: true })],
      ["x", stats({ itemsCompleted: 0, itemsTotal: 50 })],
      ["y", stats({ itemsCompleted: 0, itemsTotal: 50 })],
    ]);
    // The diploma is complete despite 100 untouched items sitting elsewhere.
    expect(credentialProgress(courses, byId).find((c) => c.key === "diploma")).toMatchObject({
      pct: 100,
      earned: true,
    });
  });

  it("tolerates whitespace around a stored category", () => {
    const courses = [{ id: "d", category: `  ${DIPLOMA}  ` }];
    const byId = new Map<string, CourseStats>([
      ["d", stats({ itemsCompleted: 1, itemsTotal: 2 })],
    ]);
    expect(credentialProgress(courses, byId).find((c) => c.key === "diploma")).toMatchObject({
      pct: 50,
      coursesTotal: 1,
    });
  });

  it("skips a course with no stats rather than counting it as zero-of-zero", () => {
    const courses = [
      { id: "d", category: DIPLOMA },
      { id: "missing", category: DIPLOMA },
    ];
    const byId = new Map<string, CourseStats>([
      ["d", stats({ itemsCompleted: 3, itemsTotal: 3, complete: true })],
    ]);
    const out = credentialProgress(courses, byId).find((c) => c.key === "diploma")!;
    expect(out.itemsTotal).toBe(3);
    // The course still counts toward the roster, so the credential is NOT earned.
    expect(out.coursesTotal).toBe(2);
    expect(out.earned).toBe(false);
  });

  it("always returns the three credentials in row order", () => {
    expect(credentialProgress([], new Map()).map((c) => c.key)).toEqual([
      "diploma",
      "knockers",
      "hustlers",
    ]);
  });
});
