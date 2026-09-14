import { describe, it, expect } from "vitest";
import { newSinceFinished, newItemsLabel, finishedAt, pageCreatedAt } from "./new-since-finished";

// Creation times live in the page ids.
const FEB = "1772000000000"; // 2026-02-25
const MAR = "1774000000000"; // 2026-03-20
const JUN = "1780500000000"; // 2026-06-03
const AUG = "1786500000000"; // 2026-08-12
const PASSED_FINAL = "2026-04-01T15:00:00Z";

const oldLesson = { id: `lesson-${FEB}`, status: "published" };
const oldQuiz = { id: `quiz-${FEB}`, status: "published", isQuiz: true };
const skippedLesson = { id: `lesson-${MAR}`, status: "published" };
const augQuizUnderOlderLesson = { id: `quiz-${AUG}`, status: "published", isQuiz: true };
const finalTest = { id: `final-${MAR}`, status: "published", isQuiz: true, isFinalTest: true };
const newLesson = { id: `lesson-${JUN}`, status: "published" };
const newQuiz = { id: `quizb-${JUN}`, status: "published", isQuiz: true };
const draftLesson = { id: `draft-${JUN}`, status: "draft" };
const course = [oldLesson, oldQuiz, skippedLesson, augQuizUnderOlderLesson, finalTest, newLesson, newQuiz, draftLesson];

const graduate = {
  courseCompleted: true,
  completedPages: [oldLesson.id],
  quizResults: [
    { pageId: oldQuiz.id, passed: true, submittedAt: "2026-03-01T10:00:00Z" },
    { pageId: finalTest.id, passed: true, submittedAt: PASSED_FINAL },
  ],
};

describe("pageCreatedAt", () => {
  it("reads the creation time from the id", () => {
    expect(pageCreatedAt("page-1772750386438")).toBe(1772750386438);
  });

  it("is null for ids without a plausible time", () => {
    expect(pageCreatedAt("g-l1")).toBeNull();
    expect(pageCreatedAt("page-9999999999999")).toBeNull();
  });
});

describe("finishedAt", () => {
  it("uses the passing final test", () => {
    expect(finishedAt(course, graduate)).toBe(new Date(PASSED_FINAL).getTime());
  });

  it("falls back to the latest recorded activity when there is no final test", () => {
    const progress = {
      courseCompleted: true,
      quizResults: [{ pageId: oldQuiz.id, passed: true, submittedAt: "2026-03-01T10:00:00Z" }],
      pageCompletions: [{ pageId: oldLesson.id, completedAt: "2026-03-05T10:00:00Z" }],
    };
    expect(finishedAt([oldLesson, oldQuiz], progress)).toBe(new Date("2026-03-05T10:00:00Z").getTime());
  });

  it("is null when the course is not finished or nothing was ever timed", () => {
    expect(finishedAt(course, { ...graduate, courseCompleted: false })).toBeNull();
    expect(finishedAt(course, { courseCompleted: true, completedPages: [oldLesson.id] })).toBeNull();
  });
});

describe("newSinceFinished", () => {
  it("marks only the lesson added after they finished, and that lesson's own quiz", () => {
    expect(newSinceFinished(course, [], graduate)).toEqual([newLesson.id, newQuiz.id]);
  });

  it("does not mark a lesson they skipped before finishing", () => {
    expect(newSinceFinished(course, [], graduate)).not.toContain(skippedLesson.id);
  });

  it("does not mark a quiz added later under an older lesson", () => {
    expect(newSinceFinished(course, [], graduate)).not.toContain(augQuizUnderOlderLesson.id);
  });

  it("keeps the new quiz marked once they have watched the new lesson", () => {
    const watchedNew = { ...graduate, completedPages: [oldLesson.id, newLesson.id] };
    expect(newSinceFinished(course, [], watchedNew)).toEqual([newQuiz.id]);
  });

  it("marks nothing once they have caught up", () => {
    const caughtUp = {
      ...graduate,
      completedPages: [oldLesson.id, newLesson.id],
      quizResults: [...graduate.quizResults, { pageId: newQuiz.id, passed: true, submittedAt: "2026-09-01T10:00:00Z" }],
    };
    expect(newSinceFinished(course, [], caughtUp)).toEqual([]);
  });

  it("marks nothing for a rep who never finished, or whose finish time is unknown", () => {
    expect(newSinceFinished(course, [], { ...graduate, courseCompleted: false })).toEqual([]);
    expect(newSinceFinished(course, [], { courseCompleted: true, completedPages: [oldLesson.id] })).toEqual([]);
  });

  it("follows the order reps see, not the raw page list", () => {
    const folders = [{ id: "f1", status: "published" }, { id: "f2", status: "published" }];
    // Raw list: the new lesson, then the old lesson, then the new quiz.
    // On screen: section f1 (old lesson, final test), then f2 (new lesson, new quiz),
    // so the new quiz sits under the new lesson and counts.
    const raw = [
      { ...newLesson, folderId: "f2" },
      { ...oldLesson, folderId: "f1" },
      { ...finalTest, folderId: "f1" },
      { ...newQuiz, folderId: "f2" },
    ];
    expect(newSinceFinished(raw, folders, graduate)).toEqual([newLesson.id, newQuiz.id]);
  });

  it("skips draft lessons and lessons in draft sections", () => {
    const inDraftSection = [oldLesson, finalTest, { ...newLesson, folderId: "fd" }, { ...newQuiz, folderId: "fd" }];
    expect(newSinceFinished(inDraftSection, [{ id: "fd", status: "draft" }], graduate)).toEqual([]);
    expect(newSinceFinished(course, [], graduate)).not.toContain(draftLesson.id);
  });
});

describe("newItemsLabel", () => {
  it("counts lessons and quizzes separately", () => {
    expect(newItemsLabel(course, [newLesson.id, newQuiz.id])).toBe("1 new lesson and 1 new quiz");
    expect(newItemsLabel(course, [oldLesson.id, newLesson.id])).toBe("2 new lessons");
    expect(newItemsLabel(course, [oldQuiz.id, newQuiz.id])).toBe("2 new quizzes");
  });

  it("is null when nothing is new", () => {
    expect(newItemsLabel(course, [])).toBeNull();
  });
});
