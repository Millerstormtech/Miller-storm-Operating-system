// GET /api/admin/quiz-audit  (admin only)
//
// Scans every course's quizzes for questions that can NEVER be graded correctly,
// which is the usual cause of "I picked the right answer but it says I failed":
//   - correctIndex is missing / not a number / out of range for the options
//     (e.g. -1 from an import whose "correct answer" column matched no option)
//   - a question has no id, or two questions share an id (answers collapse)
//
// The grading endpoint compares the picked option index to the stored
// correctIndex; if that stored value can't ever equal a real pick, the learner
// is failed no matter what they choose. This report pinpoints those questions
// so an admin can fix the correct answer in the course builder.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();
  const courses: any[] = await CourseModel.find({}).select("id title status pages").lean();

  const problems: any[] = [];
  let quizzesScanned = 0;

  for (const c of courses) {
    for (const p of c.pages || []) {
      if (!p.isQuiz) continue;
      quizzesScanned++;
      const qs: any[] = p.quizQuestions || [];
      const ids = qs.map((q) => q.id);
      const dupeIds = ids.filter((id, i) => ids.indexOf(id) !== i);
      const badQuestions: any[] = [];

      qs.forEach((q, i) => {
        const optLen = Array.isArray(q.options) ? q.options.length : 0;
        const ci = q.correctIndex;
        const reasons: string[] = [];
        if (!q.id) reasons.push("missing id");
        if (typeof ci !== "number") reasons.push(`correctIndex is not a number (${JSON.stringify(ci)})`);
        else if (ci < 0) reasons.push(`correctIndex is ${ci} (no correct answer set)`);
        else if (ci >= optLen) reasons.push(`correctIndex ${ci} is out of range (only ${optLen} options)`);
        if (reasons.length) {
          badQuestions.push({
            number: i + 1,
            prompt: (q.prompt || "").slice(0, 120),
            correctIndex: ci,
            optionCount: optLen,
            reasons,
          });
        }
      });

      if (badQuestions.length || dupeIds.length) {
        problems.push({
          courseId: c.id,
          courseTitle: c.title,
          status: c.status,
          pageId: p.id,
          lessonTitle: p.title,
          totalQuestions: qs.length,
          questionsToShow: p.questionsToShow ?? null,
          duplicateIds: [...new Set(dupeIds)],
          badQuestions,
        });
      }
    }
  }

  return res.status(200).json({
    ok: true,
    coursesScanned: courses.length,
    quizzesScanned,
    problemQuizzes: problems.length,
    problems,
    hint:
      problems.length === 0
        ? "No broken quizzes found. If a learner still fails a correct answer, the app build may be stale — rebuild/reinstall it."
        : "Open each course in the builder and set the correct answer for the listed questions, then Save.",
  });
}
