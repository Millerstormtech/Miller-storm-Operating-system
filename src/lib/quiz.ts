// Shared quiz rules used by the Sales (TrainingCenter) and Manager
// (OnlineTraining) training portals so both behave identically.

// Minimum fraction of correct answers required to pass a quiz and advance.
export const QUIZ_PASS_THRESHOLD = 0.6; // 60%

// Number of failed attempts allowed before the user is sent back to relearn
// the lesson. 1st fail -> "try again", 2nd fail -> "relearn the lesson".
export const QUIZ_MAX_ATTEMPTS = 2;

export type QuizScore = { correct: number; total: number };

// Fraction correct (0..1) for a score, safe against missing/zero values.
export function quizPct(score?: QuizScore | null): number {
  if (!score || !score.total) return 0;
  return score.correct / score.total;
}

// Whole-number percent for display.
export function quizPercent(score?: QuizScore | null): number {
  return Math.round(quizPct(score) * 100);
}

// Did this saved quiz result meet the passing threshold?
export function isQuizResultPassing(
  result?: { score?: QuizScore | null } | null
): boolean {
  return quizPct(result?.score) >= QUIZ_PASS_THRESHOLD;
}

// Fisher–Yates shuffle returning a NEW array. Called fresh per user and per
// retry, so two users (or two attempts) get a different question order while
// the underlying question ids — and therefore the saved answers — stay valid.
export function shuffleQuestions<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick the questions to actually present for a quiz attempt: shuffle the full
// pool, then keep only `questionsToShow` of them when the creator set a limit
// (a positive number smaller than the pool). Undefined / 0 / >= pool size keeps
// every question. Called fresh per user and per retry, so each attempt gets a
// different random subset and order.
export function selectQuizQuestions<T>(questions: T[], questionsToShow?: number): T[] {
  const shuffled = shuffleQuestions(questions);
  if (questionsToShow && questionsToShow > 0 && questionsToShow < shuffled.length) {
    return shuffled.slice(0, questionsToShow);
  }
  return shuffled;
}
