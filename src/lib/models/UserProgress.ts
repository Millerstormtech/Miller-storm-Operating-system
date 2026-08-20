import { Schema, model, models } from "mongoose";

// Which of the learner's own answers were right. Deliberately does NOT record
// the correct option: nothing that reaches a learner may carry the answer key
// (see toLearnerReview in src/lib/training/quiz-grading.ts). Stored so that
// reopening a passed quiz can still mark the attempt, instead of showing the
// answers with no marking at all.
const quizReviewEntrySchema = new Schema(
  { questionId: String, chosenIndex: Number, correct: Boolean },
  { _id: false }
);

const quizResultSchema = new Schema(
  {
    pageId: String,
    answers: Schema.Types.Mixed,
    score: { correct: Number, total: Number },
    // Only passing attempts are ever saved, so this is always true; stored
    // explicitly so the pass gate can trust it directly (see isQuizResultPassing).
    passed: Boolean,
    // Absent on results saved before server-side grading shipped, so readers
    // must treat an empty review as "no marking available", never as "all wrong".
    review: [quizReviewEntrySchema],
    submittedAt: Date
  },
  { _id: false }
);

// When each completed page was FIRST completed. Purely additive alongside
// completedPages, which stays the source of truth for whether a page is done:
// roughly fifteen readers and two Flutter screens depend on that field and none
// of them change. This one exists because completedPages carries no dates, so
// the training board can only report all-time standing; recording dates from
// now on is what makes a week/month/year training board possible later.
//
// Populated by stampNewCompletions() in src/lib/training/completions.ts, which
// every writer calls so the two lists can never drift apart. NOT backfillable:
// pages completed before this shipped have no date and never will, so a reader
// must treat a missing entry as "unknown", never as zero.
const pageCompletionSchema = new Schema(
  { pageId: String, completedAt: Date },
  { _id: false }
);

const userProgressSchema = new Schema(
  {
    userId: { type: String, required: true },
    courseId: { type: String, required: true },
    completedPages: [String],
    pageCompletions: [pageCompletionSchema],
    // Pages a manager has manually unlocked for this user WITHOUT them watching.
    // Kept SEPARATE from completedPages so unlocking never counts toward progress
    // %/leaderboard — only actually watching a video marks a page completed.
    unlockedPages: [String],
    quizResults: [quizResultSchema],
    courseCompleted: { type: Boolean, default: false },
    completedAt: Date
  },
  { timestamps: true }
);

userProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export const UserProgressModel = models.UserProgress || model("UserProgress", userProgressSchema);
