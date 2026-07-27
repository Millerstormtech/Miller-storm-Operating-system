// Server-authoritative quiz grading (spec 2026-07-26).
//
// PURE ONLY: no database, no React, no I/O. This is the single source of truth
// for what a quiz score is, so the API can grade a submission without trusting
// anything the client claims.

import { QUIZ_PASS_THRESHOLD } from "../quiz";

export type QuizQuestionLike = {
  id: string;
  prompt?: string;
  options?: string[];
  correctIndex?: number;
};

export type QuizPageLike = {
  id: string;
  quizQuestions?: QuizQuestionLike[];
  questionsToShow?: number;
};

/** questionId -> the option index the learner picked. */
export type SubmittedAnswers = Record<string, number>;

export type ReviewEntry = {
  questionId: string;
  chosenIndex: number;
  correctIndex: number;
  correct: boolean;
};

export type GradeResult = {
  correct: number;
  total: number;
  pct: number;
  passed: boolean;
  review: ReviewEntry[];
};

/**
 * A review entry as the LEARNER is allowed to see it: which answer they gave
 * and whether it was right. NOT which answer was correct.
 */
export type LearnerReviewEntry = {
  questionId: string;
  chosenIndex: number;
  correct: boolean;
};

/**
 * How many questions this quiz presents. THE SERVER DECIDES THE DENOMINATOR:
 * a submission that contains one answer must score 1 of 10, never 1 of 1.
 *
 * Mirrors selectQuizQuestions() in ../quiz, which does the client-side pick.
 */
export function presentedCount(page: QuizPageLike): number {
  const pool = page.quizQuestions || [];
  const limit = page.questionsToShow;
  return typeof limit === "number" && limit > 0 && limit < pool.length ? limit : pool.length;
}

/**
 * Grade one attempt against the course's own answer key.
 *
 * Answers whose question id is no longer in the pool are ignored rather than
 * counted wrong: a quiz edited after the attempt must never crash grading.
 * Correct answers are capped at the presented count, so submitting more
 * answers than were shown can never exceed 100%.
 */
export function gradeQuizAttempt(page: QuizPageLike, answers: SubmittedAnswers): GradeResult {
  const pool = page.quizQuestions || [];
  const byId = new Map(pool.map((q) => [q.id, q]));
  const total = presentedCount(page);

  const review: ReviewEntry[] = [];
  for (const [questionId, chosenIndex] of Object.entries(answers || {})) {
    const question = byId.get(questionId);
    if (!question || typeof question.correctIndex !== "number") continue;
    review.push({
      questionId,
      chosenIndex,
      correctIndex: question.correctIndex,
      correct: chosenIndex === question.correctIndex,
    });
  }

  const correct = Math.min(review.filter((r) => r.correct).length, total);
  const pct = total > 0 ? correct / total : 0;
  return { correct, total, pct, passed: total > 0 && pct >= QUIZ_PASS_THRESHOLD, review };
}

/**
 * Reduce a review to what a learner may receive: `correctIndex` is dropped, so
 * a rep who got a question wrong is told ONLY that it was wrong, never what the
 * right answer was.
 *
 * This is load-bearing for anti-cheat, not just pedagogy. If the grading reply
 * carried the answer key, a rep could submit one throwaway attempt, read every
 * answer out of the response, and retake with a perfect score. Stripping the
 * key from the course payload would have been pointless while this response
 * handed it straight back.
 *
 * Rebuilt from an explicit field list, so a future field on ReviewEntry cannot
 * leak through by accident.
 */
export function toLearnerReview(review: ReviewEntry[]): LearnerReviewEntry[] {
  return (review || []).map((r) => ({
    questionId: r.questionId,
    chosenIndex: r.chosenIndex,
    correct: r.correct,
  }));
}
