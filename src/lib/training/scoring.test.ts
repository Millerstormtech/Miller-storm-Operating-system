import { describe, it, expect } from "vitest";
import { publishedItems, courseStats, rankTitleFor, badgesFor, teamScore, isRankedRole, isRankedUser, isPageComplete, type CourseLike, type ProgressLike } from "./scoring";
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

describe("rankTitleFor (10-course library)", () => {
  it("maps courses completed to the rank ladder", () => {
    expect(rankTitleFor(0, 10)).toBe("Rookie");
    expect(rankTitleFor(1, 10)).toBe("Rising");
    expect(rankTitleFor(2, 10)).toBe("Rising");
    expect(rankTitleFor(3, 10)).toBe("Pro");
    expect(rankTitleFor(4, 10)).toBe("Pro");
    expect(rankTitleFor(5, 10)).toBe("Ace");
    expect(rankTitleFor(6, 10)).toBe("Ace");
    expect(rankTitleFor(7, 10)).toBe("Elite");
    expect(rankTitleFor(9, 10)).toBe("Elite");
    expect(rankTitleFor(10, 10)).toBe("Legend");
  });

  it("makes Legend dynamic, not hard-coded to 10", () => {
    expect(rankTitleFor(6, 6)).toBe("Legend");
    expect(rankTitleFor(12, 12)).toBe("Legend");
  });

  it("never returns Legend when the library is empty", () => {
    expect(rankTitleFor(0, 0)).toBe("Rookie");
  });
});

describe("badgesFor", () => {
  const base = {
    itemsCompleted: 0,
    itemsTotal: 293,
    coursesCompleted: 0,
    totalCourses: 10,
    hasTestAce: false,
  };

  it("earns nothing with no progress", () => {
    expect(badgesFor(base)).toEqual([]);
  });

  it("does NOT award anything for merely watching videos (First Steps was removed)", () => {
    expect(badgesFor({ ...base, itemsCompleted: 1 })).toEqual([]);
  });

  it("awards halfway at 50% of the library", () => {
    expect(badgesFor({ ...base, itemsCompleted: 147 })).toEqual(["halfway"]);
  });

  it("does not award halfway just below 50%", () => {
    expect(badgesFor({ ...base, itemsCompleted: 146 })).toEqual([]);
  });

  it("awards finisher on the first completed course", () => {
    expect(badgesFor({ ...base, coursesCompleted: 1 })).toEqual(["finisher"]);
  });

  it("awards graduate (with halfway + finisher) when every course is complete", () => {
    expect(
      badgesFor({ ...base, itemsCompleted: 293, coursesCompleted: 10 })
    ).toEqual(["halfway", "finisher", "graduate"]);
  });

  it("awards test-ace on a perfect Final Test", () => {
    expect(badgesFor({ ...base, hasTestAce: true })).toEqual(["test-ace"]);
  });

  it("awards no graduate when totalCourses is 0", () => {
    expect(badgesFor({ ...base, itemsTotal: 0, totalCourses: 0 })).toEqual([]);
  });
});

describe("teamScore", () => {
  it("averages member percentages so team size does not decide it", () => {
    expect(teamScore([100, 50])).toBe(75);
    expect(teamScore([90, 90, 90, 90, 90, 90, 90, 90, 90])).toBe(90);
  });

  it("returns 0 for an empty team rather than dividing by zero", () => {
    expect(teamScore([])).toBe(0);
  });
});

describe("isRankedRole", () => {
  it("accepts only the two sales primary roles", () => {
    expect(isRankedRole("sales")).toBe(true);
    expect(isRankedRole("sales-team-lead")).toBe(true);
  });

  it("rejects leadership — they do not compete", () => {
    expect(isRankedRole("branch-manager")).toBe(false);
    expect(isRankedRole("admin")).toBe(false);
    expect(isRankedRole("c-level")).toBe(false);
    expect(isRankedRole("marketing")).toBe(false);
  });

  it("rejects missing roles", () => {
    expect(isRankedRole(undefined)).toBe(false);
    expect(isRankedRole(null)).toBe(false);
    expect(isRankedRole("")).toBe(false);
  });
});

describe("isExcludedAccount", () => {
  it("scrubs the developer test accounts", () => {
    expect(isExcludedAccount("ishitapatel3456@gmail.com")).toBe(true);
    expect(isExcludedAccount("k81565600@gmail.com")).toBe(true);
  });

  it("scrubs the CEO and shared mailboxes", () => {
    expect(isExcludedAccount("jaymiller@millerstorm.com")).toBe(true);
    expect(isExcludedAccount("tech@millerstorm.com")).toBe(true);
  });

  it("is case-insensitive and tolerates whitespace", () => {
    expect(isExcludedAccount("  JayMiller@MillerStorm.com ")).toBe(true);
  });

  it("keeps real reps", () => {
    expect(isExcludedAccount("preston.taylor@millerstorm.com")).toBe(false);
    expect(isExcludedAccount("sarahbeth3013@gmail.com")).toBe(false);
  });

  it("does not crash on a missing email", () => {
    expect(isExcludedAccount(undefined)).toBe(false);
    expect(isExcludedAccount(null)).toBe(false);
  });
});

describe("isRankedUser", () => {
  it("ranks a real rep", () => {
    expect(isRankedUser({ role: "sales", email: "preston.taylor@millerstorm.com" })).toBe(true);
  });

  it("rejects a branch manager even though they train", () => {
    expect(isRankedUser({ role: "branch-manager", email: "gunner@millerstorm.com" })).toBe(false);
  });

  it("rejects a scrubbed account that holds a sales role", () => {
    expect(isRankedUser({ role: "sales", email: "jaymiller@millerstorm.com" })).toBe(false);
    expect(isRankedUser({ role: "sales-team-lead", email: "ishitapatel3456@gmail.com" })).toBe(false);
  });
});

describe("isPageComplete", () => {
  const video = { id: "v1", status: "published", isQuiz: false };
  const quiz = { id: "q1", status: "published", isQuiz: true };
  const pass = { pageId: "q1", score: { correct: 8, total: 10 } };          // 80% — a normal pass
  const lowButSaved = { pageId: "q1", score: { correct: 3, total: 10 } };   // 30% stored, but SAVED — subset-quiz case
  const explicitFail = { pageId: "q1", score: { correct: 7, total: 10 }, passed: false }; // explicitly marked failed

  it("greens a video once it is watched", () => {
    expect(isPageComplete(video, new Set(["v1"]), [])).toBe(true);
  });

  it("leaves an unwatched video grey", () => {
    expect(isPageComplete(video, new Set(), [])).toBe(false);
  });

  it("greens a quiz once it is passed", () => {
    expect(isPageComplete(quiz, new Set(), [pass])).toBe(true);
  });

  it("leaves a quiz grey when no result was ever saved", () => {
    expect(isPageComplete(quiz, new Set(), [])).toBe(false);
  });

  it("leaves a quiz grey when the saved result explicitly marks passed: false", () => {
    expect(isPageComplete(quiz, new Set(), [explicitFail])).toBe(false);
  });

  it("counts a saved low-score result as passed (subset quiz)", () => {
    // The stored score can legitimately sit below 80% for a quiz the learner
    // genuinely passed (a subset quiz shows only N of the question pool, or
    // the quiz's question count was edited after the fact). The result was
    // only ever saved because the 80% check passed at submit time, so its
    // mere presence is the signal — the stored score is not re-checked here.
    expect(isPageComplete(quiz, new Set(), [lowButSaved])).toBe(true);
  });

  it("does NOT green a quiz just because its id is in completedPages", () => {
    // The bug this fixes in reverse: a quiz is only ever green by a saved result.
    expect(isPageComplete(quiz, new Set(["q1"]), [])).toBe(false);
  });

  it("greens a retried quiz once any attempt was actually saved as a pass", () => {
    expect(isPageComplete(quiz, new Set(), [explicitFail, pass])).toBe(true);
  });

  it("accepts completedPages as an array as well as a Set", () => {
    expect(isPageComplete(video, ["v1"], [])).toBe(true);
  });

  it("does not crash on missing quiz results", () => {
    expect(isPageComplete(quiz, new Set(), [])).toBe(false);
  });
});
