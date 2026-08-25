import { describe, it, expect } from "vitest";
import {
  credentialProgress,
  nextCredential,
  orphanCategories,
  canonicalCategory,
  CREDENTIALS,
} from "./credentials";
import { TRAINING_CATEGORIES, UNCATEGORIZED_LABEL, groupCoursesByCategory } from "./categories";
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

describe("orphanCategories", () => {
  // The 2026-08-20 bug: five published courses carried "Millionaire Knockers"
  // and "Roof Hustlers" while CREDENTIALS matched on the longer certificate
  // strings that no course had ever been filed under. Nothing errored. Both bars read 0% for every rep while
  // real progress sat in those courses. Code-level drift is caught by the suite
  // above; this catches the DATA-level drift the suite cannot see, and
  // scripts/check-credential-categories.js runs it against a live database.
  it("names a category that belongs to no credential", () => {
    // The two strings CREDENTIALS matched on until 2026-08-20. Nothing carries
    // them now, so a course filed under either is unreachable by any bar.
    expect(
      orphanCategories([
        { id: "a", category: CREDENTIALS[0].category },
        { id: "b", category: "Matt Mulholland Certificate" },
        { id: "c", category: "DeShaun Bryant (Roof Hustlers) Certificate" },
      ])
    ).toEqual(["DeShaun Bryant (Roof Hustlers) Certificate", "Matt Mulholland Certificate"]);
  });

  it("is quiet when every course matches a credential", () => {
    expect(
      orphanCategories(CREDENTIALS.map((c, i) => ({ id: String(i), category: c.category })))
    ).toEqual([]);
  });

  it("ignores uncategorised courses, which are a deliberate state", () => {
    // An admin filling in a new course has not broken anything yet.
    expect(orphanCategories([{ id: "a" }, { id: "b", category: "" }, { id: "c", category: "   " }])).toEqual([]);
  });

  it("reports each distinct category once, sorted, however many courses carry it", () => {
    expect(
      orphanCategories([
        { id: "a", category: "Sales Bootcamp" },
        { id: "b", category: "Sales Bootcamp" },
        { id: "c", category: "Matt Mulholland Certificate" },
      ])
    ).toEqual(["Matt Mulholland Certificate", "Sales Bootcamp"]);
  });

  it("matches the way credentialProgress does, trimmed and case sensitive", () => {
    // credentialProgress trims but does NOT lowercase, so this must agree or
    // the check would pass while the board still reads 0%.
    expect(orphanCategories([{ id: "a", category: `  ${CREDENTIALS[0].category}  ` }])).toEqual([]);
    expect(orphanCategories([{ id: "b", category: CREDENTIALS[0].category.toLowerCase() }])).toHaveLength(1);
  });
});

describe("legacy category aliases", () => {
  // Why aliases exist: renaming a credential's category means the code and the
  // stored course documents disagree until a migration runs, and during that
  // window the bar reads 0% for every rep. Worse, the order is a trap: migrate
  // BEFORE the new code is live and the OLD code stops matching instead. An
  // alias removes the window and the ordering rule entirely. The migration
  // becomes tidy-up, not a deploy step that can break the board.
  const LEGACY = "Miller Storm Diploma";

  it("counts a course still carrying the pre-rename category", () => {
    const byId = new Map([["old", stats({ itemsCompleted: 5, itemsTotal: 10 })]]);
    expect(
      credentialProgress([{ id: "old", category: LEGACY }], byId).find((c) => c.key === "certificate")
    ).toMatchObject({ pct: 50, itemsCompleted: 5, itemsTotal: 10, coursesTotal: 1 });
  });

  it("merges old and new spellings into ONE credential, never two", () => {
    const byId = new Map([
      ["old", stats({ itemsCompleted: 5, itemsTotal: 10, complete: false })],
      ["new", stats({ itemsCompleted: 10, itemsTotal: 10, complete: true })],
    ]);
    const out = credentialProgress(
      [{ id: "old", category: LEGACY }, { id: "new", category: MSCERT }],
      byId
    ).find((c) => c.key === "certificate")!;
    // Half a mid-migration library must not read as two separate credentials.
    expect(out).toMatchObject({ itemsCompleted: 15, itemsTotal: 20, pct: 75, coursesTotal: 2, coursesCompleted: 1 });
  });

  it("does not report a known legacy spelling as orphaned", () => {
    expect(orphanCategories([{ id: "a", category: LEGACY }])).toEqual([]);
  });

  it("still reports a genuinely unknown category as orphaned", () => {
    expect(orphanCategories([{ id: "a", category: "Miller Storm Dipoma" }])).toEqual(["Miller Storm Dipoma"]);
  });

  it("resolves a legacy spelling to the name shown today", () => {
    expect(canonicalCategory(LEGACY)).toBe(MSCERT);
    expect(canonicalCategory(`  ${LEGACY}  `)).toBe(MSCERT);
    expect(canonicalCategory(MSCERT)).toBe(MSCERT);
  });

  it("leaves an unrecognised or empty category exactly as it found it", () => {
    expect(canonicalCategory("Sales Bootcamp")).toBe("Sales Bootcamp");
    expect(canonicalCategory("")).toBe("");
    expect(canonicalCategory(undefined)).toBe("");
  });

  it("never lets a legacy alias double as a live category", () => {
    // An alias that is also some other credential's category would make one
    // course count towards two bars.
    const live = new Set(CREDENTIALS.map((c) => c.category));
    for (const c of CREDENTIALS) for (const a of c.aliases || []) expect(live.has(a)).toBe(false);
  });

  it("keeps retired spellings OUT of the Course Builder dropdown", () => {
    // An admin must never be offered the old name as a fresh pick.
    for (const c of CREDENTIALS) for (const a of c.aliases || []) expect(TRAINING_CATEGORIES).not.toContain(a);
  });

  it("files a mid-migration library under ONE Training Center heading, the new one", () => {
    const sections = groupCoursesByCategory([
      { id: "old", category: LEGACY },
      { id: "new", category: MSCERT },
    ] as any);
    const mine = sections.filter((s) => s.category === MSCERT);
    expect(mine).toHaveLength(1);
    expect(mine[0].courses).toHaveLength(2);
    expect(sections.map((s) => s.category)).not.toContain(LEGACY);
  });
});

describe("the 2026-08-24 Certification rename", () => {
  // A live regression, not a hypothetical. On 2026-08-24 the four tier 1
  // courses were renamed in the Course Builder from "Miller Storm Certificate"
  // to "Miller Storm Certification". `category` is both the visible heading AND
  // the only join to the credential, so the credential matched zero courses:
  // every rep's Miller Storm bar read 0%, two reps who had already earned it
  // stopped showing as earned, and nothing raised an error anywhere, because a
  // category mismatch cannot fail loudly. It can only count to zero.
  const STORED = "Miller Storm Certification";
  const PRINTED = "Miller Storm Certificate";

  it("joins on the string the courses are actually filed under", () => {
    expect(CREDENTIALS[0].category).toBe(STORED);
  });

  it("still counts a course left under the pre-rename spelling", () => {
    // Both spellings exist in the wild: 9 published courses were migrated, but
    // a draft published later could still carry the old one.
    expect(canonicalCategory(PRINTED)).toBe(STORED);
    expect(canonicalCategory("Miller Storm Diploma")).toBe(STORED);
  });

  it("keeps printing the name Jay chose, which is NOT the stored heading", () => {
    // The two deliberately differ. If someone ever "tidies" label to match
    // category, the certificate PDF starts saying Certification.
    expect(CREDENTIALS[0].label).toBe(PRINTED);
    expect(CREDENTIALS[0].label).not.toBe(CREDENTIALS[0].category);
  });

  it("counts all four tier 1 courses however they are spelled", () => {
    const courses = [
      { id: "p1", category: STORED },
      { id: "p2", category: PRINTED },
      { id: "p3", category: "Miller Storm Diploma" },
      { id: "p4", category: `  ${STORED}  ` },
    ];
    const done = stats({ itemsCompleted: 10, itemsTotal: 10, complete: true });
    const byId = new Map(courses.map((c) => [c.id, done]));
    const cert = credentialProgress(courses, byId).find((c) => c.key === "certificate")!;
    expect(cert.coursesTotal).toBe(4);
    expect(cert.earned).toBe(true);
  });
});
