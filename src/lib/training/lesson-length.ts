// How long lessons and courses are, as shown to reps (2026-09-13). Reps called
// Knocking Your Way To Millions "way too long" without ever being told how long
// anything was. Lengths come from Vimeo and are stored on pages[].durationSeconds.
//
// PURE ONLY: no database, no React, no I/O. Every label the web shows is built
// here; the phone mirrors formatLessonLength() in course_detail_screen.dart.

export type TimedPage = {
  id: string;
  status?: string;
  isQuiz?: boolean;
  folderId?: string;
  durationSeconds?: number | null;
};

export type TimedFolder = { id: string; status?: string };

function knownSeconds(page: TimedPage): number | null {
  const s = page.durationSeconds;
  return typeof s === "number" && Number.isFinite(s) && s > 0 ? s : null;
}

/** "45 min", "1 hr 5 min", "2 hr". Anything under a minute reads "1 min". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** A lesson's length, e.g. "4 min". Null when the length is unknown. */
export function formatLessonLength(seconds?: number | null): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? formatMinutes(seconds / 60)
    : null;
}

/** The video lessons a rep can actually see: published, not a quiz, not in a draft section. */
function visibleLessons(pages: TimedPage[], draftFolderIds: Iterable<string>): TimedPage[] {
  const drafts = new Set(draftFolderIds);
  return (pages || []).filter(
    (p) => p.status === "published" && !p.isQuiz && !(p.folderId && drafts.has(p.folderId))
  );
}

function draftIdsOf(folders?: TimedFolder[]): string[] {
  return (folders || []).filter((f) => f.status === "draft").map((f) => f.id);
}

/**
 * Total video minutes in a course. Null when no lesson has a known length, so
 * a course with no data shows nothing rather than "1 min".
 */
export function courseMinutes(pages: TimedPage[], draftFolderIds: Iterable<string> = []): number | null {
  const seconds = visibleLessons(pages, draftFolderIds).map(knownSeconds).filter((s): s is number => s !== null);
  return seconds.length ? seconds.reduce((a, b) => a + b, 0) / 60 : null;
}

/**
 * Video minutes a rep still has to watch: visible lessons not in completedPages.
 * Lessons with an unknown length count as zero. Null when nothing that is left
 * has a known length (including when everything is watched).
 */
export function minutesLeft(
  pages: TimedPage[],
  completedPages: Iterable<string>,
  draftFolderIds: Iterable<string> = []
): number | null {
  const done = new Set(completedPages);
  const seconds = visibleLessons(pages, draftFolderIds)
    .filter((p) => !done.has(p.id))
    .map(knownSeconds)
    .filter((s): s is number => s !== null);
  return seconds.length ? seconds.reduce((a, b) => a + b, 0) / 60 : null;
}

/** A course card's length, e.g. "2 hr 10 min". Null when no lesson has a length. */
export function courseLengthLabel(pages: TimedPage[], folders?: TimedFolder[]): string | null {
  const minutes = courseMinutes(pages, draftIdsOf(folders));
  return minutes === null ? null : formatMinutes(minutes);
}

/**
 * Inside a course: "45 min left" while there is video left to watch, the
 * course length once there is not, and null when no lesson has a length.
 */
export function timeLeftLabel(pages: TimedPage[], completedPages: Iterable<string>, folders?: TimedFolder[]): string | null {
  const drafts = draftIdsOf(folders);
  const left = minutesLeft(pages, completedPages, drafts);
  if (left !== null) return `${formatMinutes(left)} left`;
  const total = courseMinutes(pages, drafts);
  return total === null ? null : formatMinutes(total);
}
