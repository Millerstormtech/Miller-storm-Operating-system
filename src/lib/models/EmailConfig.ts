import { Schema, model, models } from "mongoose";

const emailConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    status: { type: String, enum: ["draft", "published"], default: "published" },
  },
  { timestamps: true }
);

export const EmailConfigModel = models.EmailConfig || model("EmailConfig", emailConfigSchema);
