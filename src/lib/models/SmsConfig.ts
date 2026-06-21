import { Schema, model, models } from "mongoose";

const smsConfigSchema = new Schema(
  {
    accountSid: { type: String, default: "" },
    authToken: { type: String, default: "" },
    phoneNumber: { type: String, default: "" },
  },
  { timestamps: true }
);

export const SmsConfigModel = models.SmsConfig || model("SmsConfig", smsConfigSchema);
