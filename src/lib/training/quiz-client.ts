// Thin client for the server-graded quiz endpoint, shared by both web training
// portals so the two can never drift (spec 2026-07-26 §6).

export type QuizGradeResponse = {
  passed: boolean;
  score: { correct: number; total: number };
  pct: number;
  // No correctIndex, by design: the server never tells the client what the
  // right answer was, only whether the rep's own answer was right.
  review: Array<{ questionId: string; chosenIndex: number; correct: boolean }>;
};

export async function submitQuizAttempt(params: {
  courseId: string;
  pageId: string;
  answers: Record<string, number>;
}): Promise<QuizGradeResponse> {
  const res = await fetch("/api/training/quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Quiz submit failed: ${res.status}`);
  return res.json();
}

/**
 * questionId -> was the rep's own answer correct, for the post-submit review
 * UI. This is deliberately all the review screen gets: it can mark the rep's
 * choice right or wrong, and it cannot point at the right answer, because it
 * does not know it.
 */
export function reviewToCorrectnessMap(review: QuizGradeResponse["review"]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const entry of review) map[entry.questionId] = entry.correct;
  return map;
}
