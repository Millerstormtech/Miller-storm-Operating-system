import { Schema, model, models } from "mongoose";

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
    quizQuestions: [quizQuestionSchema]
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

export const CourseModel = models.Course || model("Course", courseSchema);
