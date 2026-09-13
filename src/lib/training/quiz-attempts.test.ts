import { describe, it, expect } from "vitest";
import { gradeQuizAttempt } from "./quiz-grading";
import { buildQuizAttempt } from "./quiz-attempts";

const page = {
  id: "quiz-1",
  questionsToShow: 4,
  quizQuestions: [
    { id: "q1", prompt: "One?", options: ["a", "b", "c", "d"], correctIndex: 0 },
    { id: "q2", prompt: "Two?", options: ["a", "b", "c", "d"], correctIndex: 1 },
    { id: "q3", prompt: "Three?", options: ["a", "b", "c", "d"], correctIndex: 2 },
    { id: "q4", prompt: "Four?", options: ["a", "b", "c", "d"], correctIndex: 3 },
    { id: "q5", prompt: "Five?", options: ["a", "b", "c", "d"], correctIndex: 0 },
  ],
};

const base = { userId: "user-rep", role: "sales", courseId: "course-1", pageId: "quiz-1", submittedAt: new Date("2026-09-13T15:00:00Z") };

describe("buildQuizAttempt", () => {
  it("records a failed attempt with the questions the rep got wrong", () => {
    const answers = { q1: 0, q2: 3, q3: 0, q4: 3 };
    const record = buildQuizAttempt({ ...base, grade: gradeQuizAttempt(page, answers) });
    expect(record.passed).toBe(false);
    expect(record.correct).toBe(2);
    expect(record.total).toBe(4);
    expect(record.pct).toBe(0.5);
    expect(record.questionIds).toEqual(["q1", "q2", "q3", "q4"]);
    expect(record.wrongQuestionIds).toEqual(["q2", "q3"]);
    expect(record.answers).toEqual(answers);
  });

  it("records a pass the same way", () => {
    const record = buildQuizAttempt({ ...base, grade: gradeQuizAttempt(page, { q1: 0, q2: 1, q3: 2, q5: 0 }) });
    expect(record.passed).toBe(true);
    expect(record.wrongQuestionIds).toEqual([]);
    expect(record.submittedAt).toEqual(base.submittedAt);
  });

  it("drops answers for questions that are no longer in the quiz", () => {
    const record = buildQuizAttempt({ ...base, grade: gradeQuizAttempt(page, { q1: 0, removed: 2 }) });
    expect(record.answers).toEqual({ q1: 0 });
    expect(record.questionIds).toEqual(["q1"]);
  });

  it("never stores the answer key", () => {
    const record = buildQuizAttempt({ ...base, grade: gradeQuizAttempt(page, { q1: 1, q2: 1 }) });
    expect(JSON.stringify(record)).not.toContain("correctIndex");
  });

  it("rounds the score to four decimals", () => {
    const three = { ...page, questionsToShow: 3 };
    const record = buildQuizAttempt({ ...base, grade: gradeQuizAttempt(three, { q1: 0, q2: 0, q3: 0 }) });
    expect(record.pct).toBe(0.3333);
  });
});
