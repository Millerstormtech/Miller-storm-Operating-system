import { describe, it, expect } from "vitest";
import { publishedItems, courseStats, rankTitleFor, badgesFor, teamScore, type CourseLike, type ProgressLike } from "./scoring";

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

  it("treats a quiz below 80% as unpassed", () => {
    const p: ProgressLike = { completedPages: ["v1", "v2"], quizResults: [{ pageId: "q1", score: fail }, { pageId: "qf", score: pass }] };
    expect(courseStats(c, p).quizzesPassed).toBe(1);
    expect(courseStats(c, p).complete).toBe(false);
  });

  it("keeps the BEST attempt when a quiz was retried", () => {
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

  it("does not let a malformed attempt poison a later passing retry", () => {
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

  it("keeps credit when a passing attempt is followed by a failing one", () => {
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
  const base = { videosWatched: 0, itemsCompleted: 0, itemsTotal: 100, coursesCompleted: 0, totalCourses: 10, hasQuizAce: false };

  it("gives no badges to a rep who has done nothing", () => {
    expect(badgesFor(base)).toEqual([]);
  });

  it("awards first-steps on the first VIDEO, not the first quiz", () => {
    expect(badgesFor({ ...base, videosWatched: 1, itemsCompleted: 1 })).toContain("first-steps");
    expect(badgesFor({ ...base, videosWatched: 0, itemsCompleted: 1 })).not.toContain("first-steps");
  });

  it("awards halfway at exactly 50% of all items", () => {
    expect(badgesFor({ ...base, itemsCompleted: 49 })).not.toContain("halfway");
    expect(badgesFor({ ...base, itemsCompleted: 50 })).toContain("halfway");
  });

  it("awards finisher on one completed course", () => {
    expect(badgesFor({ ...base, coursesCompleted: 1 })).toContain("finisher");
  });

  it("awards graduate only when every course is complete", () => {
    expect(badgesFor({ ...base, coursesCompleted: 9 })).not.toContain("graduate");
    expect(badgesFor({ ...base, coursesCompleted: 10 })).toContain("graduate");
  });

  it("awards quiz-ace from the flag", () => {
    expect(badgesFor({ ...base, hasQuizAce: true })).toContain("quiz-ace");
  });

  it("never awards podium — it is live state, not a badge", () => {
    const all = badgesFor({ videosWatched: 139, itemsCompleted: 293, itemsTotal: 293, coursesCompleted: 10, totalCourses: 10, hasQuizAce: true });
    expect(all).not.toContain("podium");
    expect(all).toEqual(["first-steps", "halfway", "finisher", "graduate", "quiz-ace"]);
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
