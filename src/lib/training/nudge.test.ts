import { describe, it, expect } from "vitest";
import { pickNudge, nudgeMessage, lastActivityAt, DAY_MS, type NudgePlan } from "./nudge";

const NOW = Date.UTC(2026, 8, 13, 15, 0, 0);
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();
const lesson = (id: string, extra: object = {}) => ({ id, title: `Lesson ${id}`, status: "published", ...extra });
const quiz = (id: string, extra: object = {}) => ({ id, title: `Quiz ${id}`, status: "published", isQuiz: true, ...extra });
const pass = (pageId: string, at?: string) => ({ pageId, passed: true, submittedAt: at });

// Three lessons and two quizzes.
const phase1 = { id: "c1", title: "Phase 1", status: "published", folders: [], pages: [lesson("l1"), quiz("q1"), lesson("l2"), quiz("q2"), lesson("l3")] };
// Six lessons.
const phase2 = { id: "c2", title: "Phase 2", status: "published", folders: [], pages: ["m1", "m2", "m3", "m4", "m5", "m6"].map((id) => lesson(id)) };

const almostDone = (at: string) => ({ courseId: "c1", completedPages: ["l1"], quizResults: [pass("q1", at)] });
const stalled = (at: string) => ({ courseId: "c2", completedPages: ["m1"], pageCompletions: [{ pageId: "m1", completedAt: at }] });

describe("pickNudge", () => {
  it("nudges a rep with three or fewer left who has not touched the course for a day", () => {
    const plan = pickNudge({ now: NOW, courses: [phase1], progress: [almostDone(daysAgo(2))], pastNudges: [] });
    expect(plan).toMatchObject({ courseId: "c1", reason: "almost-done", lessonsLeft: 2, quizzesLeft: 1, pct: 40, idleDays: 2, pageId: "l2" });
  });

  it("leaves a rep alone in the middle of a session", () => {
    const threeHoursAgo = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
    expect(pickNudge({ now: NOW, courses: [phase1], progress: [almostDone(threeHoursAgo)], pastNudges: [] })).toBeNull();
  });

  it("nudges a rep who has done nothing in a started course for a week", () => {
    const plan = pickNudge({ now: NOW, courses: [phase2], progress: [stalled(daysAgo(9))], pastNudges: [] });
    expect(plan).toMatchObject({ courseId: "c2", reason: "stalled", lessonsLeft: 5, quizzesLeft: 0, pct: 17, idleDays: 9, pageId: "m2" });
  });

  it("leaves a rep alone who is working through a course", () => {
    expect(pickNudge({ now: NOW, courses: [phase2], progress: [stalled(daysAgo(2))], pastNudges: [] })).toBeNull();
  });

  it("counts a failed quiz attempt as activity", () => {
    const trying = { ...stalled(daysAgo(9)), attemptedAt: [daysAgo(1)] };
    expect(pickNudge({ now: NOW, courses: [phase2], progress: [trying], pastNudges: [] })).toBeNull();
  });

  it("never nudges about a finished course or one never started", () => {
    const finished = { ...stalled(daysAgo(30)), courseCompleted: true };
    const notStarted = { courseId: "c2", completedPages: [], pageCompletions: [] };
    expect(pickNudge({ now: NOW, courses: [phase2], progress: [finished], pastNudges: [] })).toBeNull();
    expect(pickNudge({ now: NOW, courses: [phase2], progress: [notStarted], pastNudges: [] })).toBeNull();
  });

  it("skips progress that was never timed", () => {
    const untimed = { courseId: "c1", completedPages: ["l1"], quizResults: [pass("q1")] };
    expect(pickNudge({ now: NOW, courses: [phase1], progress: [untimed], pastNudges: [] })).toBeNull();
  });

  it("sends at most one nudge a week, whatever the course", () => {
    const progress = [stalled(daysAgo(30))];
    expect(pickNudge({ now: NOW, courses: [phase2], progress, pastNudges: [{ courseId: "c1", sentAt: daysAgo(3) }] })).toBeNull();
    expect(pickNudge({ now: NOW, courses: [phase2], progress, pastNudges: [{ courseId: "c1", sentAt: daysAgo(8) }] })).not.toBeNull();
  });

  it("gives up after three nudges about one course with nothing done in between", () => {
    const progress = [stalled(daysAgo(30))];
    const two = [{ courseId: "c2", sentAt: daysAgo(22) }, { courseId: "c2", sentAt: daysAgo(15) }];
    const three = [{ courseId: "c2", sentAt: daysAgo(29) }, ...two];
    expect(pickNudge({ now: NOW, courses: [phase2], progress, pastNudges: two })).not.toBeNull();
    expect(pickNudge({ now: NOW, courses: [phase2], progress, pastNudges: three })).toBeNull();
    // Nudges from before their last activity do not count against them.
    const old = [{ courseId: "c2", sentAt: daysAgo(40) }, { courseId: "c2", sentAt: daysAgo(35) }, { courseId: "c2", sentAt: daysAgo(31) }];
    expect(pickNudge({ now: NOW, courses: [phase2], progress, pastNudges: old })).not.toBeNull();
  });

  it("prefers the course closest to done", () => {
    const plan = pickNudge({ now: NOW, courses: [phase1, phase2], progress: [stalled(daysAgo(20)), almostDone(daysAgo(10))], pastNudges: [] });
    expect(plan?.courseId).toBe("c1");
  });

  it("opens the first item not done, in the order reps see", () => {
    const course = {
      id: "c3", title: "Folders", status: "published",
      folders: [{ id: "f1" }, { id: "f2" }],
      pages: [lesson("x2", { folderId: "f2" }), lesson("x1", { folderId: "f1" }), quiz("xq", { folderId: "f1" })],
    };
    const progress = [{ courseId: "c3", completedPages: ["x1"], pageCompletions: [{ pageId: "x1", completedAt: daysAgo(10) }] }];
    expect(pickNudge({ now: NOW, courses: [course], progress, pastNudges: [] })?.pageId).toBe("xq");
  });

  it("ignores lessons in a draft section", () => {
    const course = {
      id: "c4", title: "Drafts", status: "published",
      folders: [{ id: "fd", status: "draft" }, { id: "f2" }],
      pages: [lesson("y1", { folderId: "fd" }), lesson("y2", { folderId: "f2" }), lesson("y3", { folderId: "f2" })],
    };
    const progress = [{ courseId: "c4", completedPages: ["y2"], pageCompletions: [{ pageId: "y2", completedAt: daysAgo(10) }] }];
    expect(pickNudge({ now: NOW, courses: [course], progress, pastNudges: [] })).toMatchObject({ reason: "almost-done", lessonsLeft: 1, pageId: "y3" });
  });
});

describe("lastActivityAt", () => {
  it("takes the latest of quizzes, lessons and attempts", () => {
    const p = { courseId: "c1", quizResults: [pass("q1", daysAgo(5))], pageCompletions: [{ pageId: "l1", completedAt: daysAgo(3) }], attemptedAt: [daysAgo(4)] };
    expect(lastActivityAt(p)).toBe(NOW - 3 * DAY_MS);
  });

  it("is null when nothing was timed", () => {
    expect(lastActivityAt({ courseId: "c1", completedPages: ["l1"] })).toBeNull();
  });
});

describe("nudgeMessage", () => {
  const plan = (o: Partial<NudgePlan>): NudgePlan => ({
    courseId: "c1", courseTitle: "Phase 1", reason: "almost-done", lessonsLeft: 0, quizzesLeft: 0, pct: 0, idleDays: 2, pageId: "p", pageTitle: "The 5 Pitches", ...o,
  });

  it("counts what is left when almost done", () => {
    expect(nudgeMessage(plan({ lessonsLeft: 1 }))).toEqual({ title: "Almost done with Phase 1", body: "Just 1 lesson left. Next up: The 5 Pitches." });
    expect(nudgeMessage(plan({ lessonsLeft: 2, quizzesLeft: 1 })).body).toBe("Just 2 lessons and 1 quiz left. Next up: The 5 Pitches.");
    expect(nudgeMessage(plan({ quizzesLeft: 3, pageTitle: "Final Test?" })).body).toBe("Just 3 quizzes left. Next up: Final Test.");
  });

  it("says how far along a stalled rep is", () => {
    expect(nudgeMessage(plan({ reason: "stalled", pct: 17, courseTitle: "Phase 2" }))).toEqual({
      title: "Pick up Phase 2 again",
      body: "You're 17% of the way through. Next up: The 5 Pitches.",
    });
  });

  it("uses no em dashes", () => {
    for (const p of [plan({ lessonsLeft: 1 }), plan({ reason: "stalled", pct: 50 })]) {
      const m = nudgeMessage(p);
      expect(m.title + m.body).not.toMatch(/—/);
    }
  });
});
