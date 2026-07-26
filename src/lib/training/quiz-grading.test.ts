import { describe, it, expect } from "vitest";
import { presentedCount, gradeQuizAttempt } from "./quiz-grading";
import type { QuizPageLike } from "./quiz-grading";

/** A pool of n questions where question i has correctIndex 0. */
function page(n: number, questionsToShow?: number): QuizPageLike {
  return {
    id: "quiz-1",
    questionsToShow,
    quizQuestions: Array.from({ length: n }, (_, i) => ({
      id: `q${i + 1}`,
      prompt: `Question ${i + 1}`,
      options: ["right", "wrong", "also wrong"],
      correctIndex: 0,
    })),
  };
}

/** Answer the first k questions correctly. */
function correctAnswers(k: number): Record<string, number> {
  const a: Record<string, number> = {};
  for (let i = 1; i <= k; i++) a[`q${i}`] = 0;
  return a;
}

describe("presentedCount", () => {
  it("is the pool size when no limit is set", () => {
    expect(presentedCount(page(5))).toBe(5);
  });

  it("is the limit when the limit is smaller than the pool", () => {
    expect(presentedCount(page(20, 10))).toBe(10);
  });

  it("is the pool size when the limit is zero or at least the pool size", () => {
    expect(presentedCount(page(5, 0))).toBe(5);
    expect(presentedCount(page(5, 5))).toBe(5);
    expect(presentedCount(page(5, 99))).toBe(5);
  });
});

describe("gradeQuizAttempt", () => {
  it("passes a perfect attempt", () => {
    const g = gradeQuizAttempt(page(5), correctAnswers(5));
    expect(g).toMatchObject({ correct: 5, total: 5, passed: true });
    expect(g.pct).toBe(1);
  });

  it("treats exactly the threshold as a pass and just under as a fail", () => {
    expect(gradeQuizAttempt(page(5), correctAnswers(4)).passed).toBe(true); // 80%
    expect(gradeQuizAttempt(page(5), correctAnswers(3)).passed).toBe(false); // 60%
  });

  it("counts a wrong answer as wrong", () => {
    const g = gradeQuizAttempt(page(5), { q1: 0, q2: 0, q3: 0, q4: 0, q5: 1 });
    expect(g).toMatchObject({ correct: 4, total: 5, passed: true });
  });

  it("uses the server's presented count as the denominator, so a partial submission cannot inflate the score", () => {
    // One correct answer on a quiz that presents 10 is 1/10, never 1/1.
    const g = gradeQuizAttempt(page(20, 10), correctAnswers(1));
    expect(g).toMatchObject({ correct: 1, total: 10, passed: false });
  });

  it("does not raise the score when questions are skipped", () => {
    // 4 of 5 answered, all correct: 4/5 = 80%, not 4/4.
    const g = gradeQuizAttempt(page(5), correctAnswers(4));
    expect(g.total).toBe(5);
  });

  it("caps correct answers at the presented count when more answers are submitted than were shown", () => {
    const g = gradeQuizAttempt(page(20, 5), correctAnswers(20));
    expect(g).toMatchObject({ correct: 5, total: 5, passed: true });
  });

  it("ignores answers for question ids that are not in the pool", () => {
    const g = gradeQuizAttempt(page(5), { ...correctAnswers(5), "q-deleted": 0 });
    expect(g).toMatchObject({ correct: 5, total: 5, passed: true });
    expect(g.review.map((r) => r.questionId)).not.toContain("q-deleted");
  });

  it("cannot pass a quiz with no questions", () => {
    const g = gradeQuizAttempt({ id: "empty", quizQuestions: [] }, {});
    expect(g).toMatchObject({ correct: 0, total: 0, pct: 0, passed: false });
  });

  it("returns a review entry per gradable answer", () => {
    const g = gradeQuizAttempt(page(2), { q1: 0, q2: 2 });
    expect(g.review).toEqual([
      { questionId: "q1", chosenIndex: 0, correctIndex: 0, correct: true },
      { questionId: "q2", chosenIndex: 2, correctIndex: 0, correct: false },
    ]);
  });

  it("treats a missing answers object as a zero-score attempt", () => {
    expect(gradeQuizAttempt(page(5), {} as any).correct).toBe(0);
  });
});
