import { Schema, model, models } from "mongoose";

// A lightweight mirror of the AccuLynx user roster (one doc per AccuLynx login, per
// sub-account), refreshed on every AccuLynx sync. Used at leaderboard read time to
// answer "does this rep have an AccuLynx account?" — the email/nameKey/phone are stored
// already-normalized (normEmail/normName/normPhone) so read-time matching is a Set lookup.
const acculynxUserSchema = new Schema(
  {
    companyId: { type: String, required: true }, // AccuLynx company id (the sub-account)
    acculynxId: { type: String, required: true }, // AccuLynx user id (unique within a sub-account)
    email: { type: String, default: "" },
    nameKey: { type: String, default: "" },
    phone: { type: String, default: "" },
    branch: { type: String, default: "" }, // cleaned sub-account label, for reference
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

// Same person appears across sub-accounts (different acculynxId each) — that's fine; we
// only ever build a union of identities. Unique per (sub-account, user) keeps upserts idempotent.
acculynxUserSchema.index({ companyId: 1, acculynxId: 1 }, { unique: true });

export const AcculynxUserModel =
  models.AcculynxUser || model("AcculynxUser", acculynxUserSchema);
