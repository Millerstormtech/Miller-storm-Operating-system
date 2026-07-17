import { describe, it, expect } from "vitest";
import { publishedItems, courseStats, type CourseLike, type ProgressLike } from "./scoring";

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
});
