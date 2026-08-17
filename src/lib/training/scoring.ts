// Single source of truth for every training scoring rule.
//
// PURE ONLY: no database, no React, no I/O. Callers pass plain objects in and
// get plain values out. This is what makes these rules unit-testable — and they
// decide who is "complete", who earns a badge, and who gets paid, so they must
// live in exactly one place.

export type CourseFolder = { id: string; status?: string };

export type CoursePage = {
  id: string;
  title?: string;
  status?: string;
  isQuiz?: boolean;
  isFinalTest?: boolean;
  folderId?: string;
};

export type CourseLike = {
  id: string;
  title?: string;
  status?: string;
  pages?: CoursePage[];
  folders?: CourseFolder[];
};

export type CourseItems = {
  videoIds: string[];
  quizIds: string[];
  finalTestId: string | null;
};

/**
 * The pages of a course that actually count toward progress: published, and NOT
 * inside a folder the admin explicitly marked "draft".
 *
 * The learner UI shows a folder's published pages regardless of the folder's own
 * status, so a folder with NO status set (legacy / imported courses) is visible
 * to reps AND its watched lessons must count — otherwise a rep sees a green tick
 * on a video but 0% progress (the tick reads completedPages, the % read this
 * function, and they disagreed). Only an EXPLICITLY draft folder is hidden from
 * reps, so only its pages are excluded here.
 */
export function publishedItems(course: CourseLike): CourseItems {
  const draftFolders = new Set(
    (course.folders || []).filter((f) => f.status === "draft").map((f) => f.id)
  );
  const visible = (course.pages || []).filter(
    (p) => p.status === "published" && (!p.folderId || !draftFolders.has(p.folderId))
  );
  const quizzes = visible.filter((p) => p.isQuiz);
  const final = quizzes.find((p) => p.isFinalTest === true);
  return {
    videoIds: visible.filter((p) => !p.isQuiz).map((p) => p.id),
    quizIds: quizzes.map((p) => p.id),
    finalTestId: final ? final.id : null,
  };
}

/**
 * How many LESSONS a course holds, for the "12 lessons" line on a Training
 * Center card. Quizzes are excluded on purpose: the card answers "how much
 * video is in here", not "how many items must I complete".
 *
 * Deliberately built on publishedItems() rather than a fresh filter, so it
 * inherits the draft-folder rule and can never disagree with the course viewer.
 */
export function lessonCount(course: CourseLike): number {
  return publishedItems(course).videoIds.length;
}

import { quizPct, isQuizResultPassing } from "../quiz";

export type QuizResultLike = {
  pageId: string;
  score?: { correct?: number; total?: number } | null;
  passed?: boolean;
};

export type ProgressLike = {
  completedPages?: string[];
  quizResults?: QuizResultLike[];
} | null | undefined;

export type CourseStats = {
  videosWatched: number;
  videosTotal: number;
  quizzesPassed: number;
  quizzesTotal: number;
  itemsCompleted: number;
  itemsTotal: number;
  pct: number;
  complete: boolean;
  finalTestPerfect: boolean;
  started: boolean;
};

/**
 * Best fraction (0..1) achieved per quiz page. A rep may retry a quiz, which
 * appends another result — the best attempt is the one that counts.
 *
 * Used ONLY for finalTestPerfect (Test Ace), which is genuinely score-based:
 * it asks whether the best attempt hit 100% of the questions shown, not
 * whether the quiz was passed. Do NOT use this to decide quizzesPassed — see
 * passedQuizIds below.
 */
function bestQuizScores(progress: ProgressLike, quizIds: string[]): Map<string, number> {
  const wanted = new Set(quizIds);
  const best = new Map<string, number>();
  for (const r of progress?.quizResults || []) {
    if (!wanted.has(r.pageId)) continue;
    const pct = quizPct((r.score as { correct: number; total: number } | null) ?? null);
    best.set(r.pageId, Math.max(best.get(r.pageId) ?? 0, pct));
  }
  return best;
}

/**
 * Which of these quiz pages the rep has passed. Pass = a saved result exists
 * (results are only ever persisted on a pass; an explicit passed:false is
 * honoured) — see isQuizResultPassing in ../quiz. The stored score must NOT be
 * re-checked here: subset quizzes and question-count edits legitimately leave
 * passed quizzes with stored scores below the threshold.
 */
function passedQuizIds(progress: ProgressLike, quizIds: string[]): Set<string> {
  const wanted = new Set(quizIds);
  const passed = new Set<string>();
  for (const r of progress?.quizResults || []) {
    if (!wanted.has(r.pageId)) continue;
    if (isQuizResultPassing(r as { score?: { correct: number; total: number } | null; passed?: boolean })) {
      passed.add(r.pageId);
    }
  }
  return passed;
}

/**
 * One rep's standing in one course.
 *
 * COMPLETE = every published video watched AND every published quiz has a
 * saved (passing) result, including the Final Test. Watching alone is never
 * enough. A quiz's PRESENCE in quizResults means it was passed — results are
 * only ever persisted on a pass, so the stored score is not re-checked here
 * (see isQuizResultPassing in ../quiz for why: subset quizzes and edited
 * question counts can leave a genuinely-passed quiz with a low stored score).
 */
export function courseStats(course: CourseLike, progress: ProgressLike): CourseStats {
  const { videoIds, quizIds, finalTestId } = publishedItems(course);
  const watched = new Set(progress?.completedPages || []);
  const videosWatched = videoIds.filter((id) => watched.has(id)).length;

  const quizzesPassed = passedQuizIds(progress, quizIds).size;
  const best = bestQuizScores(progress, quizIds);

  const itemsCompleted = videosWatched + quizzesPassed;
  const itemsTotal = videoIds.length + quizIds.length;

  return {
    videosWatched,
    videosTotal: videoIds.length,
    quizzesPassed,
    quizzesTotal: quizIds.length,
    itemsCompleted,
    itemsTotal,
    pct: itemsTotal > 0 ? Math.round((itemsCompleted / itemsTotal) * 100) : 0,
    complete:
      videoIds.length > 0 &&
      videosWatched === videoIds.length &&
      quizzesPassed === quizIds.length,
    finalTestPerfect: finalTestId ? (best.get(finalTestId) ?? 0) >= 1 : false,
    started: itemsCompleted > 0,
  };
}






/**
 * A team's score is the AVERAGE of its members' percentages, so a tight
 * 5-person team can beat a 9-person one. A raw total would let bigger teams win
 * on headcount alone.
 */
export function teamScore(memberPcts: number[]): number {
  if (!memberPcts.length) return 0;
  return Math.round(memberPcts.reduce((a, b) => a + b, 0) / memberPcts.length);
}

import { isExcludedAccount } from "./excluded-accounts";

/**
 * The only roles that appear on the leaderboard.
 *
 * IMPORTANT: match on the PRIMARY `role` only — never on `roles[]`. The legacy
 * query also matched `roles[]`, which is why branch managers and admins were
 * ranked as salespeople: `roles[]` is used to mark leadership who also run a
 * sales team (Gunner, Mike Muscari, Daniel Sabedra). Decision: leadership does
 * not compete.
 */
export const RANKED_ROLES = ["sales", "sales-team-lead"] as const;

export function isRankedRole(role?: string | null): boolean {
  return role === "sales" || role === "sales-team-lead";
}

/** Full eligibility: a ranked primary role AND not on the scrub-list. */
export function isRankedUser(user: { role?: string | null; email?: string | null }): boolean {
  return isRankedRole(user.role) && !isExcludedAccount(user.email);
}

/**
 * Is a single page finished, for this rep?
 *
 * Videos and quizzes are finished in DIFFERENT ways, and conflating them is the
 * bug this replaces: quiz ids never appear in `completedPages` (a quiz is
 * recorded in `quizResults`), so asking `completedPages.has(quiz.id)` was always
 * false and a quiz tick could never turn green.
 *
 *   video -> watched (id present in completedPages)
 *   quiz  -> passed  (ANY saved result counts — results are only ever
 *                     persisted on a pass, so presence alone is the signal;
 *                     see isQuizResultPassing in ../quiz)
 */
export function isPageComplete(
  page: CoursePage,
  completedPages: Set<string> | string[],
  quizResults: QuizResultLike[]
): boolean {
  if (page.isQuiz) {
    return (quizResults || []).some(
      (r) => r.pageId === page.id && isQuizResultPassing(r as { score?: { correct: number; total: number } | null })
    );
  }
  const watched = completedPages instanceof Set ? completedPages : new Set(completedPages || []);
  return watched.has(page.id);
}
