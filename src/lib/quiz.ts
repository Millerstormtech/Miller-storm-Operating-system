// Shared quiz rules used by the Sales (TrainingCenter) and Manager
// (OnlineTraining) training portals so both behave identically.

// Minimum fraction of correct answers required to pass a quiz and advance.
export const QUIZ_PASS_THRESHOLD = 0.8; // 80%

// Number of failed attempts allowed before the user is sent back to relearn
// the lesson. 1st fail -> "try again", 2nd fail -> "relearn the lesson".
export const QUIZ_MAX_ATTEMPTS = 2;

export type QuizScore = { correct: number; total: number };

// Fraction correct (0..1) for a score, safe against missing/zero/non-numeric
// values. A malformed saved result (e.g. `{ total: 10 }` with no `correct`,
// which the schema permits since neither field is required) must never
// produce NaN here: NaN poisons Math.max folds in bestQuizScores() and
// silently denies reps quiz credit they already earned on a later attempt.
export function quizPct(score?: QuizScore | null): number {
  if (!score || !score.total || typeof score.correct !== "number" || Number.isNaN(score.correct)) {
    return 0;
  }
  return score.correct / score.total;
}

// Whole-number percent for display.
export function quizPercent(score?: QuizScore | null): number {
  return Math.round(quizPct(score) * 100);
}

// Did the learner pass this quiz?
//
// A quiz result is ONLY ever written when the learner passed: both the web
// portals (Sales TrainingCenter, Manager OnlineTraining) and the mobile app
// gate the save behind the 80% check and NEVER persist a failed attempt. So the
// mere PRESENCE of a saved result means the quiz was passed.
//
// We must NOT re-derive pass/fail from the stored score here. A quiz's saved
// score can legitimately sit below 80% for a quiz the learner genuinely
// passed — subset quizzes (only N of the pool shown), later edits to a quiz's
// question count, and legacy records all produce this. Re-checking the score
// wrongly marked those quizzes incomplete, which re-locked every lesson after
// them (the reported "quiz complete but showing not done / videos locked" bug).
//
// Honour an explicit `passed: false` if one is ever written; otherwise any
// saved result counts as a pass.
export function isQuizResultPassing(
  result?: { score?: QuizScore | null; passed?: boolean } | null
): boolean {
  if (!result) return false;
  if (result.passed === false) return false;
  return true;
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
