// Lessons added to a course after a rep finished it (2026-09-13). Adding a
// lesson quietly un-finishes a course: on 11 September, 36 of Phase 1's 48
// graduates had never seen the lessons added after they passed, and nothing
// told them. Youssef's call: reps should watch the new lessons, so the Training
// Center points them out and a one-off reminder can list them.
//
// "Added after they finished" is decided by TIME, not by what is left undone.
// Measured on production: a graduate can also have skipped lessons through a
// manual unlock, and in August a quiz was added under almost every lesson they
// had already watched. Neither of those is a new lesson. What counts:
//   - a lesson created after the rep finished that they have not watched;
//   - a quiz created after the rep finished that belongs to such a lesson.
// Page ids carry their creation time ("page-1772750386438"). The finish time is
// when the rep passed the course's final test or, without one, their latest
// recorded quiz or lesson. No finish time means nothing is marked.
//
// PURE ONLY: no database, no React, no I/O.
import { isQuizResultPassing } from "../quiz";

type Stamp = Date | string | number | null | undefined;

export type NewItemPage = { id: string; status?: string; isQuiz?: boolean; isFinalTest?: boolean; folderId?: string };
export type NewItemFolder = { id: string; status?: string };
export type NewItemProgress = {
  courseCompleted?: boolean | null;
  completedPages?: Iterable<string> | null;
  quizResults?: ReadonlyArray<{ pageId?: string; passed?: boolean; submittedAt?: Stamp } | null | undefined> | null;
  pageCompletions?: ReadonlyArray<{ pageId?: string; completedAt?: Stamp } | null | undefined> | null;
};

const EARLIEST = Date.UTC(2024, 0, 1);
const LATEST = Date.UTC(2031, 0, 1);

/** The creation time inside a page id such as "page-1772750386438", or null. */
export function pageCreatedAt(pageId: string): number | null {
  const m = /(\d{13})\D*$/.exec(String(pageId || ""));
  const t = m ? Number(m[1]) : NaN;
  return t > EARLIEST && t < LATEST ? t : null;
}

function timeOf(stamp: Stamp): number | null {
  if (stamp === null || stamp === undefined || stamp === "") return null;
  const t = new Date(stamp as string | number | Date).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * When a rep finished the course: their last passing final test, else their
 * latest recorded quiz or lesson. Null when the course is not finished or no
 * time was ever recorded.
 */
export function finishedAt(pages: NewItemPage[], progress: NewItemProgress | null | undefined): number | null {
  if (!progress?.courseCompleted) return null;
  const finals = new Set((pages || []).filter((p) => p.isFinalTest).map((p) => p.id));
  const results = (progress.quizResults || []).filter(
    (r): r is { pageId?: string; passed?: boolean; submittedAt?: Stamp } => !!r
  );
  const finalPasses = results
    .filter((r) => !!r.pageId && finals.has(r.pageId) && isQuizResultPassing(r))
    .map((r) => timeOf(r.submittedAt))
    .filter((t): t is number => t !== null);
  if (finalPasses.length) return Math.max(...finalPasses);
  const activity = [
    ...results.map((r) => timeOf(r.submittedAt)),
    ...(progress.pageCompletions || []).map((c) => timeOf(c?.completedAt)),
  ].filter((t): t is number => t !== null);
  return activity.length ? Math.max(...activity) : null;
}

/** Rep-facing order: pages outside folders first, then each folder in turn. */
function inDisplayOrder<T extends NewItemPage>(pages: T[], folders: NewItemFolder[]): T[] {
  const known = new Set(folders.map((f) => f.id));
  return [
    ...pages.filter((p) => !p.folderId),
    ...folders.flatMap((f) => pages.filter((p) => p.folderId === f.id)),
    ...pages.filter((p) => p.folderId && !known.has(p.folderId)),
  ];
}

/** The lessons, and their quizzes, added after this rep finished and not done yet. */
export function newSinceFinished(
  pages: NewItemPage[],
  folders: NewItemFolder[] | null | undefined,
  progress: NewItemProgress | null | undefined
): string[] {
  const finished = finishedAt(pages || [], progress);
  if (finished === null || !progress) return [];
  const drafts = new Set((folders || []).filter((f) => f.status === "draft").map((f) => f.id));
  const visible = inDisplayOrder(pages || [], folders || []).filter(
    (p) => p.status === "published" && !(p.folderId && drafts.has(p.folderId))
  );
  const watched = new Set(progress.completedPages || []);
  const results = progress.quizResults || [];
  const addedAfter = (p: NewItemPage) => {
    const created = pageCreatedAt(p.id);
    return created !== null && created > finished;
  };

  const out: string[] = [];
  let lessonIsNew = false;
  for (const p of visible) {
    if (!p.isQuiz) {
      lessonIsNew = addedAfter(p);
      if (lessonIsNew && !watched.has(p.id)) out.push(p.id);
    } else if (lessonIsNew && addedAfter(p) && !isQuizResultPassing(results.find((r) => r?.pageId === p.id) || null)) {
      out.push(p.id);
    }
  }
  return out;
}

/** "2 new lessons", "1 new quiz", "2 new lessons and 1 new quiz". Null when nothing is new. */
export function newItemsLabel(pages: NewItemPage[], newIds: readonly string[]): string | null {
  if (!newIds.length) return null;
  const ids = new Set(newIds);
  const items = (pages || []).filter((p) => ids.has(p.id));
  const lessons = items.filter((p) => !p.isQuiz).length;
  const quizzes = items.filter((p) => p.isQuiz).length;
  const parts: string[] = [];
  if (lessons) parts.push(`${lessons} new lesson${lessons === 1 ? "" : "s"}`);
  if (quizzes) parts.push(`${quizzes} new ${quizzes === 1 ? "quiz" : "quizzes"}`);
  return parts.length ? parts.join(" and ") : null;
}
