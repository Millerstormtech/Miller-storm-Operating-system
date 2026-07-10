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

// The bell/pop-up read a single user's UNREAD notifications newest-first on every
// page (polled every 20s). Without this index that was a full-collection scan +
// in-memory sort, and the collection grows forever (every chat message writes
// one notification per member). This compound index makes the equality match on
// userId+read and the createdAt sort fully index-backed.
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const NotificationModel = models.Notification || model("Notification", notificationSchema);
