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
