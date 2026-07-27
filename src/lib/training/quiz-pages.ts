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
  const publishedFolders = new Set(
    (course.folders || []).filter((f: any) => f.status === "published").map((f: any) => f.id)
  );
  return (course.pages || [])
    .filter(
      (p: any) =>
        p.isQuiz && p.status === "published" && (!p.folderId || publishedFolders.has(p.folderId))
    )
    .map((p: any) => ({
      id: p.id,
      quizQuestions: p.quizQuestions,
      questionsToShow: p.questionsToShow,
    }));
}
