// Decides what a progress-save endpoint may actually persist for quizzes
// (spec 2026-07-26 §5). PURE ONLY: no database, no I/O.
//
// The client's claimed score and verdict are never trusted. Two invariants are
// load-bearing here:
//   1. History is never re-judged. A stored result whose answers are unchanged
//      is returned exactly as it was stored, timestamp and all. Re-deriving
//      pass/fail from stored data previously re-locked lessons reps had
//      legitimately finished (see isQuizResultPassing in ../quiz).
//   2. An earned pass is never downgraded. A failing submission for a page
//      that already holds a pass leaves the stored pass alone.

import { gradeQuizAttempt, type QuizPageLike, type SubmittedAnswers } from "./quiz-grading";

export type StoredQuizResult = {
  pageId: string;
  answers?: SubmittedAnswers | null;
  score?: { correct?: number; total?: number } | null;
  passed?: boolean;
  submittedAt?: Date | string;
};

export type RejectedResult = {
  pageId: string;
  claimed: { correct?: number; total?: number } | null;
  server: { correct: number; total: number };
};

export type IntakeOutcome = {
  results: StoredQuizResult[];
  rejected: RejectedResult[];
};

/** Identical key set and identical value per key. */
export function sameAnswers(a?: SubmittedAnswers | null, b?: SubmittedAnswers | null): boolean {
  const left = a || {};
  const right = b || {};
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((k) => left[k] === right[k]);
}

export function resolveIncomingQuizResults(params: {
  quizPages: QuizPageLike[];
  stored: StoredQuizResult[];
  incoming: StoredQuizResult[];
}): IntakeOutcome {
  const { quizPages, stored, incoming } = params;
  const pageById = new Map(quizPages.map((p) => [p.id, p]));

  // Seed with everything already stored, in stored order. Replacements keep
  // their position; brand new results append.
  const byPageId = new Map<string, StoredQuizResult>();
  for (const result of stored) byPageId.set(result.pageId, result);

  const rejected: RejectedResult[] = [];

  for (const entry of incoming) {
    if (!entry || typeof entry.pageId !== "string") continue;
    const page = pageById.get(entry.pageId);
    if (!page) continue; // not a gradable published quiz page of this course

    const existing = byPageId.get(entry.pageId);
    if (existing && sameAnswers(existing.answers, entry.answers)) continue; // history untouched

    const grade = gradeQuizAttempt(page, entry.answers || {});
    if (grade.passed) {
      byPageId.set(entry.pageId, {
        pageId: entry.pageId,
        answers: entry.answers || {},
        score: { correct: grade.correct, total: grade.total },
        passed: true,
        submittedAt: new Date(),
      });
    } else {
      rejected.push({
        pageId: entry.pageId,
        claimed: entry.score ?? null,
        server: { correct: grade.correct, total: grade.total },
      });
    }
  }

  return { results: [...byPageId.values()], rejected };
}
