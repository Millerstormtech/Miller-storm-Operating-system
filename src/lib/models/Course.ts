import { Schema, model, models, deleteModel } from "mongoose";

const quizQuestionSchema = new Schema(
  {
    id: String,
    prompt: String,
    options: [String],
    correctIndex: Number
  },
  { _id: false }
);

const lessonLinkSchema = new Schema(
  {
    label: String,
    href: String
  },
  { _id: false }
);

const coursePageSchema = new Schema(
  {
    id: String,
    title: String,
    status: String,
    body: String,
    folderId: String,
    videoUrl: String,
    transcript: String,
    pinnedCommunityPostUrl: String,
    resourceLinks: [lessonLinkSchema],
    fileUrls: [lessonLinkSchema],
    isQuiz: Boolean,
    // Marks the course's cumulative Final Test (exactly one per course).
    // Set by scripts/backfill-final-test.js and by the Course Builder — never
    // inferred from the title at runtime, because renaming the page would
    // silently break the Quiz Ace badge.
    isFinalTest: Boolean,
    quizQuestions: [quizQuestionSchema],
    questionsToShow: Number
  },
  { _id: false }
);

const courseFolderSchema = new Schema(
  {
    id: String,
    title: String,
    status: String
  },
  { _id: false }
);

  const courseSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    tagline: String,
    description: String,
    lessonNames: [String],
    assetFiles: [String],
    marketingDocs: [String],
    icon: String,
    difficultyLabel: String,
    timeLabel: String,
    difficultyScore: Number,
    timeScore: Number,
    riskScore: Number,
    capitalScore: Number,
    personalityScore: Number,
    quizQuestions: [quizQuestionSchema],
    links: [lessonLinkSchema],
    status: String,
    coverImageUrl: String,
    accessMode: String,
    // When true, EVERY lesson & quiz in this course is unlocked for ALL users
    // (no sequential gating). When false, only leadership roles (C-Level,
    // Branch Manager, Sales Team Lead) get the course unlocked; sales reps
    // follow the normal sequential lock.
    unlockAll: { type: Boolean, default: false },
    folders: [courseFolderSchema],
    pages: [coursePageSchema],
    order: Number
  },
  { timestamps: true, strict: true, minimize: false }
);

// Add index for faster queries
courseSchema.index({ id: 1 });
courseSchema.index({ status: 1 });
courseSchema.index({ order: 1 });

// In dev, Next.js keeps the previously-compiled Mongoose model in `models` across
// hot-reloads. If the schema changed (e.g. a newly-added field like questionsToShow),
// the stale model silently strips that field from writes under strict mode. Drop the
// cached model so the latest schema is always used. (In production the model compiles
// once, so `models.Course` is falsy here and this is a no-op.)
if (models.Course) {
  deleteModel("Course");
}
export const CourseModel = model("Course", courseSchema);
