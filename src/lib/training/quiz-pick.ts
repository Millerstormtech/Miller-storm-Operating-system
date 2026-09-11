// Pins which questions a rep is shown for a not-yet-submitted quiz attempt, so
// web and the mobile app show the IDENTICAL subset for the same attempt —
// switching devices mid-attempt (e.g. a laptop dying before submit) must not
// hand the rep a different random pick than the one already in front of them.
//
// Previously this was picked client-side (selectQuizQuestions() in ../quiz),
// independently by whichever platform happened to render the page, with no
// shared record of the choice at all — not even across two loads of the same
// browser tab. That's fine for a quiz answered start-to-finish in one sitting,
// but gives no way to resume the same attempt anywhere else. The pin below is
// the server-side memory of "these are the questions for this attempt";
// selectQuizQuestions() is still what generates a pick, just now only once per
// attempt instead of once per page load.
//
// The pin is deliberately NOT what grading trusts — gradeQuizAttempt() /
// presentedCount() in quiz-grading.ts already grade off questionsToShow alone,
// unaware of which specific ids were shown. This file is purely a display
// consistency layer on top of that.
import { UserProgressModel } from "../models/UserProgress";
import { selectQuizQuestions } from "../quiz";

export type QuizQuestionLike = { id: string; [key: string]: unknown };

/**
 * Given the full pool and a previously pinned id list (if any), return the
 * questions to present, in a stable order. Falls back to a fresh
 * selectQuizQuestions() pick whenever the pin is missing or no longer trustworthy:
 * an id the pin remembers but the pool no longer has (the admin edited the
 * quiz since), or a pinned count that no longer matches what the quiz is
 * configured to show today.
 */
export function resolvePresentedQuestions<T extends QuizQuestionLike>(
  pool: T[],
  questionsToShow: number | undefined,
  pinnedIds?: string[] | null
): T[] {
  const expectedCount =
    typeof questionsToShow === "number" && questionsToShow > 0 && questionsToShow < pool.length
      ? questionsToShow
      : pool.length;

  if (pinnedIds && pinnedIds.length === expectedCount) {
    const byId = new Map(pool.map((q) => [q.id, q]));
    const resolved = pinnedIds.map((id) => byId.get(id)).filter((q): q is T => !!q);
    if (resolved.length === expectedCount) return resolved;
  }

  return selectQuizQuestions(pool, questionsToShow);
}

/**
 * Resolve (and persist, if new or invalidated) the pinned selection for one
 * quiz page. Read-only when the existing pin is still valid — only writes on
 * first open of an attempt, or when the pin was invalidated by a quiz edit.
 *
 * A race between two near-simultaneous first-opens (e.g. web and mobile
 * loading the same never-before-opened quiz within the same second) can each
 * generate a different fresh pick and both attempt to persist it; the
 * pull-then-push below mirrors the same pattern already used for quizResults
 * in pages/api/training/quiz.ts, so it converges on exactly one entry rather
 * than accumulating duplicates. Whichever push lands last is what every
 * subsequent read (from either platform) will see from then on.
 */
export async function getOrCreateQuizPick<T extends QuizQuestionLike>(
  userId: string,
  courseId: string,
  pageId: string,
  pool: T[],
  questionsToShow: number | undefined
): Promise<T[]> {
  const doc = (await UserProgressModel.findOne(
    { userId, courseId },
    { quizPicks: 1 }
  ).lean()) as { quizPicks?: { pageId: string; questionIds: string[] }[] } | null;

  const existing = doc?.quizPicks?.find((p) => p.pageId === pageId);
  const resolved = resolvePresentedQuestions(pool, questionsToShow, existing?.questionIds);

  const resolvedIds = resolved.map((q) => q.id);
  const existingIds = existing?.questionIds || [];
  const unchanged =
    !!existing &&
    existingIds.length === resolvedIds.length &&
    existingIds.every((id, i) => id === resolvedIds[i]);

  if (!unchanged) {
    await UserProgressModel.updateOne({ userId, courseId }, { $pull: { quizPicks: { pageId } } });
    await UserProgressModel.updateOne(
      { userId, courseId },
      { $push: { quizPicks: { pageId, questionIds: resolvedIds, pickedAt: new Date() } } },
      { upsert: true }
    );
  }

  return resolved;
}

/** Clear the pin after a submission (pass or fail) — a retry must get a
 * genuinely fresh random pick, same as before pinning existed. */
export async function clearQuizPick(userId: string, courseId: string, pageId: string): Promise<void> {
  await UserProgressModel.updateOne({ userId, courseId }, { $pull: { quizPicks: { pageId } } });
}
