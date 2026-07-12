import { Schema, model, models } from "mongoose";

const publicProfileSchema = new Schema(
  {
    showHeadshot: Boolean,
    showEmail: Boolean,
    showPhone: Boolean,
    showStrengths: Boolean,
    showWeaknesses: Boolean,
    showTerritory: Boolean
  },
  { _id: false }
);

const businessPlanSchema = new Schema(
  {
    revenueGoal: Number,
    daysPerWeek: Number,
    territories: [String],
    selectedPresetId: String,
    averageDealSize: Number,
    dealsPerYear: Number,
    dealsPerMonth: Number,
    inspectionsNeeded: Number,
    doorsPerYear: Number,
    doorsPerDay: Number,
    committed: Boolean
  },
  { _id: false }
);

const webPageSchema = new Schema(
  {
    status: String,
    shortSlug: String
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    role: { type: String, required: true },
    roles: [String],
    managerId: String,
    // When true, this rep may fast-forward/seek freely in training videos
    // (normally seeking past the watched point is blocked). Granted by a
    // manager/admin/C-Level exec.
    fastForwardAllowed: { type: Boolean, default: false },
    suspended: Boolean,
    deleted: { type: Boolean, default: false },
    deletedAt: Date,
    strengths: String,
    weaknesses: String,
    bio: String,
    marketingMaterialsNotes: String,
    missionTitle: String,
    missionBody: String,
    missionCtaLabel: String,
    missionImageUrl: String,
    whyUsTitle: String,
    whyUsBody: String,
    expertRoofersTitle: String,
    expertRoofersBody: String,
    headshotUrl: String,
    phone: String,
    territory: String,
    passwordHash: String,
    businessPlan: businessPlanSchema,
    videoUrl: String,
    webPage: webPageSchema,
    publicProfile: { type: publicProfileSchema, required: true },
    featureToggles: { type: Schema.Types.Mixed, required: true },
    acculynxUserId: { type: String, default: null, index: true },
    fcmToken: { type: String, default: '' }
  },
  { timestamps: true }
);

// Unique email only among active (non-deleted) users
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deleted: { $ne: true } } }
);

export const UserModel = models.User || model("User", userSchema);
