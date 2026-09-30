import { Schema, model, models } from "mongoose";

const smsTemplateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // 'start' | 'midpoint' | 'final' | 'complete'
    label: { type: String, required: true },
    template: { type: String, required: true, maxlength: 200 },
    status: { type: String, enum: ["draft", "published"], default: "published" },
  },
  { timestamps: true }
);

export const SmsTemplateModel = models.SmsTemplate || model("SmsTemplate", smsTemplateSchema);

// Default templates used if none exist in DB
export const DEFAULT_SMS_TEMPLATES: Record<string, { label: string; template: string }> = {
  start: {
    label: "Training Started",
    template: "{user_name} has begun {course_name} training. Targeted completion time is {training_duration}.",
  },
  midpoint: {
    label: "Midpoint Reminder",
    template: "{user_name} should be halfway through their training. {time_remaining} remaining.",
  },
  final: {
    label: "Final Reminder (30 min)",
    template: "{user_name} has 30 minutes remaining to complete their training commitment.",
  },
  complete: {
    label: "Completion Notification",
    template: "{user_name} should have completed their training commitment.",
  },
};
