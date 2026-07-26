import { describe, it, expect } from "vitest";
import { sameAnswers, resolveIncomingQuizResults } from "./quiz-intake";
import type { QuizPageLike } from "./quiz-grading";

const quizPages: QuizPageLike[] = [
  {
    id: "quiz-a",
    quizQuestions: Array.from({ length: 5 }, (_, i) => ({
      id: `a${i + 1}`,
      options: ["right", "wrong"],
      correctIndex: 0,
    })),
  },
  {
    id: "quiz-b",
    quizQuestions: Array.from({ length: 5 }, (_, i) => ({
      id: `b${i + 1}`,
      options: ["right", "wrong"],
      correctIndex: 0,
    })),
  },
];

const allRightA = { a1: 0, a2: 0, a3: 0, a4: 0, a5: 0 };
const allWrongA = { a1: 1, a2: 1, a3: 1, a4: 1, a5: 1 };
const allRightB = { b1: 0, b2: 0, b3: 0, b4: 0, b5: 0 };

describe("sameAnswers", () => {
  it("matches identical maps and rejects any difference", () => {
    expect(sameAnswers({ a1: 0, a2: 1 }, { a2: 1, a1: 0 })).toBe(true);
    expect(sameAnswers({ a1: 0 }, { a1: 1 })).toBe(false);
    expect(sameAnswers({ a1: 0 }, { a1: 0, a2: 0 })).toBe(false);
    expect(sameAnswers(null, undefined)).toBe(true);
    expect(sameAnswers({ a1: 0 }, null)).toBe(false);
  });
});

describe("resolveIncomingQuizResults", () => {
  it("preserves a stored result untouched when the answers are unchanged", () => {
    const stored = [
      { pageId: "quiz-a", answers: allRightA, score: { correct: 4, total: 5 }, passed: true, submittedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const out = resolveIncomingQuizResults({ quizPages, stored, incoming: [{ ...stored[0] }] });
    expect(out.results).toHaveLength(1);
    // Same object contents, including the historical score and timestamp: history is never re-judged.
    expect(out.results[0]).toEqual(stored[0]);
    expect(out.rejected).toHaveLength(0);
  });

  it("replaces a changed passing attempt with the server's own score", () => {
    const stored = [{ pageId: "quiz-a", answers: { a1: 0 }, score: { correct: 1, total: 5 }, passed: true }];
    const out = resolveIncomingQuizResults({
      quizPages,
      stored,
      incoming: [{ pageId: "quiz-a", answers: allRightA, score: { correct: 99, total: 99 }, passed: true }],
    });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].score).toEqual({ correct: 5, total: 5 });
    expect(out.results[0].passed).toBe(true);
    expect(out.rejected).toHaveLength(0);
  });

  it("drops a failing attempt and keeps the stored pass, recording the rejection", () => {
    const stored = [{ pageId: "quiz-a", answers: allRightA, score: { correct: 5, total: 5 }, passed: true }];
    const out = resolveIncomingQuizResults({
      quizPages,
      stored,
      incoming: [{ pageId: "quiz-a", answers: allWrongA, score: { correct: 5, total: 5 }, passed: true }],
    });
    expect(out.results).toEqual(stored);
    expect(out.rejected).toEqual([
      { pageId: "quiz-a", claimed: { correct: 5, total: 5 }, server: { correct: 0, total: 5 } },
    ]);
  });

  it("adds a new passing result and rejects a new failing one", () => {
    const passed = resolveIncomingQuizResults({
      quizPages,
      stored: [],
      incoming: [{ pageId: "quiz-b", answers: allRightB, score: { correct: 5, total: 5 }, passed: true }],
    });
    expect(passed.results).toHaveLength(1);
    expect(passed.results[0]).toMatchObject({ pageId: "quiz-b", passed: true, score: { correct: 5, total: 5 } });

    const failed = resolveIncomingQuizResults({
      quizPages,
      stored: [],
      incoming: [{ pageId: "quiz-b", answers: { b1: 0 }, score: { correct: 5, total: 5 }, passed: true }],
    });
    expect(failed.results).toHaveLength(0);
    expect(failed.rejected).toHaveLength(1);
  });

  it("preserves stored results for pages the submission does not mention", () => {
    const stored = [
      { pageId: "quiz-a", answers: allRightA, score: { correct: 5, total: 5 }, passed: true },
    ];
    const out = resolveIncomingQuizResults({
      quizPages,
      stored,
      incoming: [{ pageId: "quiz-b", answers: allRightB, passed: true }],
    });
    expect(out.results.map((r) => r.pageId)).toEqual(["quiz-a", "quiz-b"]);
    expect(out.results[0]).toEqual(stored[0]);
  });

  it("ignores an incoming result for a page that is not a gradable quiz", () => {
    const out = resolveIncomingQuizResults({
      quizPages,
      stored: [],
      incoming: [{ pageId: "not-a-quiz", answers: { x: 0 }, passed: true }],
    });
    expect(out.results).toHaveLength(0);
    expect(out.rejected).toHaveLength(0);
  });
});
