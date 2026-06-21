import { Schema, model, models } from "mongoose";

const courseProgressSchema = new Schema(
  {
    userId: { type: String, required: true },
    courseId: { type: String, required: true },
    completionPercentage: { type: Number, default: 0 },
    lessonsCompleted: [String],
    lastAccessedAt: Date
  },
  { timestamps: true }
);

courseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export const CourseProgressModel = models.CourseProgress || model("CourseProgress", courseProgressSchema);
