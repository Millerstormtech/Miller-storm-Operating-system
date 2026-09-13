import { Schema, model, models } from "mongoose";

// Every graded quiz attempt, pass or fail (2026-09-13). Append-only: written by
// POST /api/training/quiz and never updated. UserProgress.quizResults still
// holds the one pass that counts; this is the history behind it, so it becomes
// possible to see which questions confuse reps and how many tries a quiz takes.
// The record is built by buildQuizAttempt() in src/lib/training/quiz-attempts.ts.
const quizAttemptSchema = new Schema(
  {
    userId: { type: String, required: true },
    role: { type: String, default: "" },
    courseId: { type: String, required: true },
    pageId: { type: String, required: true },
    passed: { type: Boolean, required: true },
    correct: { type: Number, required: true },
    total: { type: Number, required: true },
    pct: { type: Number, required: true },
    /** questionId -> option index picked, only for questions still in the quiz. */
    answers: { type: Schema.Types.Mixed, default: {} },
    questionIds: { type: [String], default: [] },
    wrongQuestionIds: { type: [String], default: [] },
    submittedAt: { type: Date, required: true },
  },
  { minimize: false }
);

quizAttemptSchema.index({ userId: 1, courseId: 1, pageId: 1, submittedAt: -1 });
quizAttemptSchema.index({ courseId: 1, pageId: 1, submittedAt: -1 });

export const QuizAttemptModel = models.QuizAttempt || model("QuizAttempt", quizAttemptSchema);
