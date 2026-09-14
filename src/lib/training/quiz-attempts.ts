// The record stored for every graded quiz attempt, pass or fail (2026-09-13).
// Before this only passes were kept, so nobody could see which questions
// confuse reps, how many tries a quiz takes, or whether "two fails, then
// rewatch the lesson" is doing its job.
//
// PURE ONLY: no database, no I/O. POST /api/training/quiz stores what this builds.
import type { GradeResult, SubmittedAnswers } from "./quiz-grading";

export type QuizAttemptRecord = {
  userId: string;
  role: string;
  courseId: string;
  pageId: string;
  passed: boolean;
  correct: number;
  total: number;
  /** 0 to 1, rounded to four decimals. */
  pct: number;
  /** questionId -> option index picked, only for questions still in the quiz. */
  answers: SubmittedAnswers;
  /** Every graded question in the attempt, in submission order. */
  questionIds: string[];
  /** The graded questions the rep got wrong, in submission order. */
  wrongQuestionIds: string[];
  submittedAt: Date;
};

/**
 * Build the stored record from the server's own grade. Everything comes from
 * the grade, not the raw request body, so answers for questions that are no
 * longer in the quiz are dropped and a padded submission cannot bloat the row.
 * The answer key (correctIndex) is never copied in.
 */
export function buildQuizAttempt(input: {
  userId: string;
  role: string;
  courseId: string;
  pageId: string;
  grade: GradeResult;
  submittedAt: Date;
}): QuizAttemptRecord {
  const { grade } = input;
  const answers: SubmittedAnswers = {};
  for (const r of grade.review) answers[r.questionId] = r.chosenIndex;
  return {
    userId: input.userId,
    role: input.role,
    courseId: input.courseId,
    pageId: input.pageId,
    passed: grade.passed,
    correct: grade.correct,
    total: grade.total,
    pct: Math.round(grade.pct * 10000) / 10000,
    answers,
    questionIds: grade.review.map((r) => r.questionId),
    wrongQuestionIds: grade.review.filter((r) => !r.correct).map((r) => r.questionId),
    submittedAt: input.submittedAt,
  };
}
