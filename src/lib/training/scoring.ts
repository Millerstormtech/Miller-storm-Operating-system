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
 * The pages of a course that actually count toward progress: published, and
 * either unfoldered or inside a published folder. A page in a draft folder is
 * invisible to reps, so it must not inflate the denominator.
 */
export function publishedItems(course: CourseLike): CourseItems {
  const publishedFolders = new Set(
    (course.folders || []).filter((f) => f.status === "published").map((f) => f.id)
  );
  const visible = (course.pages || []).filter(
    (p) => p.status === "published" && (!p.folderId || publishedFolders.has(p.folderId))
  );
  const quizzes = visible.filter((p) => p.isQuiz);
  const final = quizzes.find((p) => p.isFinalTest === true);
  return {
    videoIds: visible.filter((p) => !p.isQuiz).map((p) => p.id),
    quizIds: quizzes.map((p) => p.id),
    finalTestId: final ? final.id : null,
  };
}

import { QUIZ_PASS_THRESHOLD, quizPct } from "../quiz";

export type QuizResultLike = { pageId: string; score?: { correct?: number; total?: number } | null };

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
 * One rep's standing in one course.
 *
 * COMPLETE = every published video watched AND every published quiz passed
 * (>=80%), including the Final Test. Watching alone is never enough.
 */
export function courseStats(course: CourseLike, progress: ProgressLike): CourseStats {
  const { videoIds, quizIds, finalTestId } = publishedItems(course);
  const watched = new Set(progress?.completedPages || []);
  const videosWatched = videoIds.filter((id) => watched.has(id)).length;

  const best = bestQuizScores(progress, quizIds);
  const quizzesPassed = [...best.values()].filter((v) => v >= QUIZ_PASS_THRESHOLD).length;

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
