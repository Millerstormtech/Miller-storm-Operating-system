import { Schema, model, models } from "mongoose";

const notificationSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const NotificationModel = models.Notification || model("Notification", notificationSchema);
