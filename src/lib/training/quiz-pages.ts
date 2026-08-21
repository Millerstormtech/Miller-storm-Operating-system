// Loads the published, gradable quiz pages of a course. Not pure (queries
// Mongo), which is why it lives outside quiz-intake.ts. Caller must
// connectMongo() first.
import { CourseModel } from "../models/Course";
import type { QuizPageLike } from "./quiz-grading";

export async function loadGradableQuizPages(courseId: string): Promise<QuizPageLike[]> {
  const course: any = await CourseModel.findOne({ id: courseId })
    .select(
      "pages.id pages.status pages.isQuiz pages.folderId pages.quizQuestions pages.questionsToShow folders.id folders.status"
    )
    .lean();
  if (!course) return [];
  // Exclude ONLY folders that are explicitly draft — matching publishedItems()
  // in scoring.ts (commit 2502178) and the learner UI, which both show a
  // published page unless its folder is explicitly draft. The old rule required
  // a folder to be explicitly status==="published"; on legacy/imported courses
  // folders often have no status, so their quiz pages were dropped from the
  // gradable set. A rep would pass such a quiz, but resolveIncomingQuizResults
  // couldn't find the page and silently discarded the result, so the quiz never
  // counted and the course stuck below 100% no matter how many times they
  // passed it. Keeping this filter in step with the denominator fixes that.
  const draftFolders = new Set(
    (course.folders || []).filter((f: any) => f.status === "draft").map((f: any) => f.id)
  );
  return (course.pages || [])
    .filter(
      (p: any) =>
        p.isQuiz && p.status === "published" && (!p.folderId || !draftFolders.has(p.folderId))
    )
    .map((p: any) => ({
      id: p.id,
      quizQuestions: p.quizQuestions,
      questionsToShow: p.questionsToShow,
    }));
}
