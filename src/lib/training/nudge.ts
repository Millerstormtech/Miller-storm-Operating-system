// Nudges for reps who stall partway through a course (2026-09-13).
//
// Two situations earn one:
//   - ALMOST DONE: 3 or fewer lessons and quizzes left, and nothing done for a
//     day, so nobody is nudged in the middle of a session.
//   - STALLED: a started course with nothing done for a week.
// Three limits keep it from turning into nagging:
//   - at most one nudge per rep per week, whatever the course;
//   - never about a course they finished or never started;
//   - after three nudges about one course with nothing done in between, stop.
// Progress that carries no times at all (work done before completion times
// began to be recorded) is skipped: nothing can say how long it has been idle.
//
// PURE ONLY: no database, no React, no I/O.
import { courseStats, isPageComplete, type CourseLike, type CoursePage, type QuizResultLike } from "./scoring";
import { inDisplayOrder } from "./display-order";

type Stamp = Date | string | number | null | undefined;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const NUDGE_RULES = {
  daysBetweenNudges: 7,
  almostDoneMaxLeft: 3,
  almostDoneIdleDays: 1,
  stalledIdleDays: 7,
  maxUnanswered: 3,
} as const;

export type NudgeReason = "almost-done" | "stalled";

export type NudgeProgress = {
  courseId: string;
  courseCompleted?: boolean | null;
  completedPages?: string[] | null;
  quizResults?: ReadonlyArray<(QuizResultLike & { submittedAt?: Stamp }) | null | undefined> | null;
  pageCompletions?: ReadonlyArray<{ pageId?: string; completedAt?: Stamp } | null | undefined> | null;
  /** Quiz attempts, passed or failed: trying counts as activity. */
  attemptedAt?: ReadonlyArray<Stamp> | null;
};

export type PastNudge = { courseId: string; sentAt: Stamp };

export type NudgePlan = {
  courseId: string;
  courseTitle: string;
  reason: NudgeReason;
  lessonsLeft: number;
  quizzesLeft: number;
  pct: number;
  idleDays: number;
  /** The lesson or quiz the nudge opens: the first one not done, in the order reps see. */
  pageId: string;
  pageTitle: string;
};

function timeOf(stamp: Stamp): number | null {
  if (stamp === null || stamp === undefined || stamp === "") return null;
  const t = new Date(stamp as string | number | Date).getTime();
  return Number.isFinite(t) ? t : null;
}

const tidy = (s: unknown) => String(s || "").replace(/\s+/g, " ").trim();

/** The last time this rep did anything in the course, or null when nothing was ever timed. */
export function lastActivityAt(progress: NudgeProgress): number | null {
  const times = [
    ...(progress.quizResults || []).map((r) => timeOf(r?.submittedAt)),
    ...(progress.pageCompletions || []).map((c) => timeOf(c?.completedAt)),
    ...(progress.attemptedAt || []).map((t) => timeOf(t)),
  ].filter((t): t is number => t !== null);
  return times.length ? Math.max(...times) : null;
}

function nextItem(course: CourseLike, completedPages: string[], results: QuizResultLike[]): CoursePage | null {
  const drafts = new Set((course.folders || []).filter((f) => f.status === "draft").map((f) => f.id));
  const watched = new Set(completedPages);
  return (
    inDisplayOrder(course.pages || [], course.folders || []).find(
      (page) =>
        page.status === "published" &&
        !(page.folderId && drafts.has(page.folderId)) &&
        !isPageComplete(page, watched, results)
    ) || null
  );
}

// Almost done first, fewest left first: the nudge most likely to end in a
// finished course. Then stalled courses, furthest along first. Ties go to the
// course touched most recently.
function byUrgency(a: NudgePlan, b: NudgePlan): number {
  if (a.reason !== b.reason) return a.reason === "almost-done" ? -1 : 1;
  const primary =
    a.reason === "almost-done"
      ? a.lessonsLeft + a.quizzesLeft - (b.lessonsLeft + b.quizzesLeft)
      : b.pct - a.pct;
  return primary || a.idleDays - b.idleDays;
}

/**
 * The one nudge this rep should get today, or null. `courses` are the published
 * courses, `progress` this rep's progress in them, `pastNudges` the nudges they
 * have been sent (at least the last few months).
 */
export function pickNudge(params: {
  now: number;
  courses: CourseLike[];
  progress: NudgeProgress[];
  pastNudges: PastNudge[];
}): NudgePlan | null {
  const { now, courses, progress, pastNudges } = params;
  const sent = pastNudges
    .map((n) => ({ courseId: n.courseId, at: timeOf(n.sentAt) }))
    .filter((n): n is { courseId: string; at: number } => n.at !== null);
  if (sent.some((n) => now - n.at < NUDGE_RULES.daysBetweenNudges * DAY_MS)) return null;

  const byId = new Map(courses.map((c) => [c.id, c]));
  const candidates: NudgePlan[] = [];
  for (const p of progress) {
    const course = byId.get(p.courseId);
    if (!course || p.courseCompleted) continue;
    const results = (p.quizResults || []).filter((r): r is QuizResultLike & { submittedAt?: Stamp } => !!r);
    const completedPages = p.completedPages || [];
    const stats = courseStats(course, { completedPages, quizResults: results });
    if (!stats.started || stats.complete) continue;

    const last = lastActivityAt(p);
    if (last === null) continue;
    const idleDays = Math.floor((now - last) / DAY_MS);
    const left = stats.itemsTotal - stats.itemsCompleted;
    const reason: NudgeReason | null =
      left <= NUDGE_RULES.almostDoneMaxLeft && idleDays >= NUDGE_RULES.almostDoneIdleDays
        ? "almost-done"
        : idleDays >= NUDGE_RULES.stalledIdleDays
          ? "stalled"
          : null;
    if (!reason) continue;
    const unanswered = sent.filter((n) => n.courseId === course.id && n.at > last).length;
    if (unanswered >= NUDGE_RULES.maxUnanswered) continue;

    const next = nextItem(course, completedPages, results);
    if (!next) continue;
    candidates.push({
      courseId: course.id,
      courseTitle: tidy(course.title),
      reason,
      lessonsLeft: stats.videosTotal - stats.videosWatched,
      quizzesLeft: stats.quizzesTotal - stats.quizzesPassed,
      pct: stats.pct,
      idleDays,
      pageId: next.id,
      pageTitle: tidy(next.title),
    });
  }
  candidates.sort(byUrgency);
  return candidates[0] || null;
}

/** What the rep reads, in the bell and on their phone. */
export function nudgeMessage(plan: NudgePlan): { title: string; body: string } {
  const next = plan.pageTitle.replace(/[\s.!?:;,]+$/, "") || "your next lesson";
  if (plan.reason === "almost-done") {
    const parts: string[] = [];
    if (plan.lessonsLeft) parts.push(`${plan.lessonsLeft} ${plan.lessonsLeft === 1 ? "lesson" : "lessons"}`);
    if (plan.quizzesLeft) parts.push(`${plan.quizzesLeft} ${plan.quizzesLeft === 1 ? "quiz" : "quizzes"}`);
    return { title: `Almost done with ${plan.courseTitle}`, body: `Just ${parts.join(" and ")} left. Next up: ${next}.` };
  }
  return { title: `Pick up ${plan.courseTitle} again`, body: `You're ${plan.pct}% of the way through. Next up: ${next}.` };
}
