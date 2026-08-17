import { describe, it, expect } from "vitest";
import { publishedItems, courseStats, lessonCount, teamScore, isRankedRole, isRankedUser, isPageComplete, type CourseLike, type ProgressLike } from "./scoring";
import { isExcludedAccount } from "./excluded-accounts";

const course: CourseLike = {
  id: "c1",
  folders: [
    { id: "f-pub", status: "published" },
    { id: "f-draft", status: "draft" },
  ],
  pages: [
    { id: "v1", status: "published", isQuiz: false },
    { id: "v2", status: "published", isQuiz: false, folderId: "f-pub" },
    { id: "v3", status: "draft", isQuiz: false },
    { id: "v4", status: "published", isQuiz: false, folderId: "f-draft" },
    { id: "q1", status: "published", isQuiz: true },
    { id: "qf", status: "published", isQuiz: true, isFinalTest: true },
  ],
};

describe("publishedItems", () => {
  it("keeps published pages that are unfoldered or in a published folder", () => {
    expect(publishedItems(course).videoIds).toEqual(["v1", "v2"]);
  });

  it("excludes draft pages and pages in draft folders", () => {
    const ids = publishedItems(course).videoIds;
    expect(ids).not.toContain("v3");
    expect(ids).not.toContain("v4");
  });

  it("separates quizzes from videos", () => {
    expect(publishedItems(course).quizIds).toEqual(["q1", "qf"]);
  });

  describe("lessonCount", () => {
    it("counts published lessons and excludes quizzes", () => {
      // `course` holds v1, v2 visible plus q1 and qf quizzes.
      expect(lessonCount(course)).toBe(2);
    });

    it("excludes draft lessons and lessons in draft folders", () => {
      // v3 (draft) and v4 (published, but inside a draft folder) must not count.
      expect(lessonCount(course)).toBe(2);
    });

    it("is zero for a course with no pages at all", () => {
      expect(lessonCount({ pages: [] } as CourseLike)).toBe(0);
      expect(lessonCount({} as CourseLike)).toBe(0);
    });

    it("is zero for a course that is nothing but quizzes", () => {
      expect(
        lessonCount({ pages: [{ id: "q", status: "published", isQuiz: true }] } as CourseLike)
      ).toBe(0);
    });
  });

  it("identifies the final test by its isFinalTest flag", () => {
    expect(publishedItems(course).finalTestId).toBe("qf");
  });

  it("returns null finalTestId when no page is flagged", () => {
    const noFinal: CourseLike = { id: "c2", pages: [{ id: "q9", status: "published", isQuiz: true }] };
    expect(publishedItems(noFinal).finalTestId).toBeNull();
  });

  it("handles a course with no pages or folders", () => {
    expect(publishedItems({ id: "empty" })).toEqual({ videoIds: [], quizIds: [], finalTestId: null });
  });
});

const c: CourseLike = {
  id: "c1",
  pages: [
    { id: "v1", status: "published" },
    { id: "v2", status: "published" },
    { id: "q1", status: "published", isQuiz: true },
    { id: "qf", status: "published", isQuiz: true, isFinalTest: true },
  ],
};
const pass = { correct: 10, total: 10 };
const fail = { correct: 5, total: 10 };

describe("courseStats", () => {
  it("counts videos watched and quizzes passed", () => {
    const p: ProgressLike = {
      completedPages: ["v1"],
      quizResults: [{ pageId: "q1", score: pass }],
    };
    const s = courseStats(c, p);
    expect(s.videosWatched).toBe(1);
    expect(s.videosTotal).toBe(2);
    expect(s.quizzesPassed).toBe(1);
    expect(s.quizzesTotal).toBe(2);
  });

  it("counts items as videos + quizzes and computes pct over both", () => {
    const p: ProgressLike = { completedPages: ["v1"], quizResults: [{ pageId: "q1", score: pass }] };
    const s = courseStats(c, p);
    expect(s.itemsCompleted).toBe(2);
    expect(s.itemsTotal).toBe(4);
    expect(s.pct).toBe(50);
  });

  it("is NOT complete when all videos are watched but a quiz is unpassed", () => {
    const p: ProgressLike = { completedPages: ["v1", "v2"], quizResults: [{ pageId: "q1", score: pass }] };
    expect(courseStats(c, p).complete).toBe(false);
  });

  it("is NOT complete when all quizzes pass but a video is unwatched", () => {
    const p: ProgressLike = {
      completedPages: ["v1"],
      quizResults: [{ pageId: "q1", score: pass }, { pageId: "qf", score: pass }],
    };
    expect(courseStats(c, p).complete).toBe(false);
  });

  it("IS complete when every video is watched and every quiz passed", () => {
    const p: ProgressLike = {
      completedPages: ["v1", "v2"],
      quizResults: [{ pageId: "q1", score: pass }, { pageId: "qf", score: pass }],
    };
    const s = courseStats(c, p);
    expect(s.complete).toBe(true);
    expect(s.pct).toBe(100);
  });

  it("counts a saved low-score result as passed (subset quiz / edited question count)", () => {
    // A quiz result is only ever saved when the learner passed at submit time
    // (the 80% check already happened then). A LOW stored score here means a
    // subset quiz (fewer questions shown) or a later edit to the question
    // count, not a failure. Presence, not the number, decides the pass — see
    // isQuizResultPassing in ../quiz.
    const p: ProgressLike = { completedPages: ["v1", "v2"], quizResults: [{ pageId: "q1", score: fail }, { pageId: "qf", score: pass }] };
    expect(courseStats(c, p).quizzesPassed).toBe(2);
    expect(courseStats(c, p).complete).toBe(true);
  });

  it("does not count a result explicitly marked passed: false, even though it was saved", () => {
    const p: ProgressLike = {
      completedPages: ["v1", "v2"],
      quizResults: [
        { pageId: "q1", score: pass, passed: false },
        { pageId: "qf", score: pass },
      ],
    };
    const s = courseStats(c, p);
    expect(s.quizzesPassed).toBe(1);
    expect(s.complete).toBe(false);
  });

  it("keeps a quiz passed across a retry, whatever the later attempt's score", () => {
    // There is no more "best attempt" for pass/fail: ANY saved result for a
    // quiz id counts it as passed. (bestQuizScores still exists, but only
    // feeds finalTestPerfect now.)
    const p: ProgressLike = {
      completedPages: ["v1", "v2"],
      quizResults: [
        { pageId: "q1", score: fail },
        { pageId: "q1", score: pass },
        { pageId: "qf", score: pass },
      ],
    };
    expect(courseStats(c, p).complete).toBe(true);
  });

  it("flags finalTestPerfect only on a 100% final test", () => {
    const perfect: ProgressLike = { quizResults: [{ pageId: "qf", score: { correct: 10, total: 10 } }] };
    const good: ProgressLike = { quizResults: [{ pageId: "qf", score: { correct: 9, total: 10 } }] };
    expect(courseStats(c, perfect).finalTestPerfect).toBe(true);
    expect(courseStats(c, good).finalTestPerfect).toBe(false);
  });

  it("counts a below-100% final test result as passed, without granting finalTestPerfect", () => {
    // Test Ace stays score-based (100% of the shown questions), but the
    // Final Test still counts toward quizzesPassed like any other quiz once
    // a result for it is saved.
    const good: ProgressLike = { quizResults: [{ pageId: "qf", score: { correct: 9, total: 10 } }] };
    const s = courseStats(c, good);
    expect(s.quizzesPassed).toBe(1);
    expect(s.finalTestPerfect).toBe(false);
  });

  it("does not let a malformed final-test attempt poison a later perfect retry (finalTestPerfect NaN safety)", () => {
    const p: ProgressLike = {
      quizResults: [
        { pageId: "qf", score: { total: 10 } as any }, // malformed: no `correct`
        { pageId: "qf", score: { correct: 10, total: 10 } },
      ],
    };
    expect(courseStats(c, p).finalTestPerfect).toBe(true);
  });

  it("treats missing progress as zero, not a crash", () => {
    const s = courseStats(c, null);
    expect(s.itemsCompleted).toBe(0);
    expect(s.pct).toBe(0);
    expect(s.started).toBe(false);
    expect(s.complete).toBe(false);
  });

  it("is never complete when a course has no videos", () => {
    expect(courseStats({ id: "empty" }, { completedPages: [] }).complete).toBe(false);
  });

  it("does not crash on a malformed saved score (presence still counts it passed)", () => {
    const p: ProgressLike = {
      completedPages: ["v1", "v2"],
      quizResults: [
        { pageId: "q1", score: { total: 10 } as any },   // malformed: no `correct`
        { pageId: "q1", score: pass },
        { pageId: "qf", score: pass },
      ],
    };
    expect(courseStats(c, p).quizzesPassed).toBe(2);
    expect(courseStats(c, p).complete).toBe(true);
  });

  it("does not revoke credit when a later saved result for the same quiz has a low score", () => {
    // Presence-based, not best-score-based: nothing here re-checks the score
    // of a later attempt, so it cannot revoke a quiz already counted passed.
    const p: ProgressLike = {
      completedPages: ["v1", "v2"],
      quizResults: [
        { pageId: "q1", score: pass },
        { pageId: "q1", score: fail },
        { pageId: "qf", score: pass },
      ],
    };
    expect(courseStats(c, p).complete).toBe(true);
  });
});
