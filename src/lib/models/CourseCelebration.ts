import { Schema, model, models } from "mongoose";

// One row per rep per celebrated course: the once-ever guard for the Storm Bot
// completion message (spec 2026-07-24 §3). The unique index makes a duplicate
// celebration physically impossible; racing saves collide harmlessly here.
const courseCelebrationSchema = new Schema(
  {
    userId: { type: String, required: true },
    courseId: { type: String, required: true },
    courseTitle: { type: String, default: "" },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

courseCelebrationSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export const CourseCelebrationModel =
  models.CourseCelebration || model("CourseCelebration", courseCelebrationSchema);
