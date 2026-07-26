// Thin client for the server-graded quiz endpoint, shared by both web training
// portals so the two can never drift (spec 2026-07-26 §6).

export type QuizGradeResponse = {
  passed: boolean;
  score: { correct: number; total: number };
  pct: number;
  review: Array<{ questionId: string; chosenIndex: number; correctIndex: number; correct: boolean }>;
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
 * questionId -> correctIndex, for the post-submit review UI. The page payload
 * no longer carries correctIndex, so the review screen reads this instead.
 */
export function reviewToCorrectMap(review: QuizGradeResponse["review"]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const entry of review) map[entry.questionId] = entry.correctIndex;
  return map;
}
