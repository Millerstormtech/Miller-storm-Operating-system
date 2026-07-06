import { Schema, model, models } from "mongoose";

const quizResultSchema = new Schema(
  {
    pageId: String,
    answers: Schema.Types.Mixed,
    score: { correct: Number, total: Number },
    submittedAt: Date
  },
  { _id: false }
);

const userProgressSchema = new Schema(
  {
    userId: { type: String, required: true },
    courseId: { type: String, required: true },
    completedPages: [String],
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
