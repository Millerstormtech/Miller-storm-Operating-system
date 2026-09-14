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
    // Phase 2: the three direct-entry MONTHLY targets the Scoreboard measures
    // against. These are the source of truth. The legacy fields below are still
    // written (derived) so the Flutter planner and the admin roll-ups keep
    // working; see src/lib/scoreboard/goals.ts. Absent = not set (no goal bar).
    monthlyRevenueTarget: Number,
    monthlyKnockTarget: Number,
    monthlyClaimsTarget: Number,
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

// This person's connected Google Calendar (Internal Workspace OAuth — see
// src/lib/googleCalendar/client.ts). accessToken/expiryDate are refreshed in
// place from refreshToken as needed; connected stays true until they disconnect
// or Google revokes access, independent of whether the access token happens to
// be expired right now.
const googleCalendarSchema = new Schema(
  {
    connected: Boolean,
    accessToken: String,
    refreshToken: String,
    // Unix ms when accessToken expires (Date.now() + expires_in*1000 at issue).
    expiryDate: Number,
    scope: String,
    connectedAt: Date
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
    // A test/demo account: hidden from every people-facing view (org chart,
    // leaderboards, role dashboards, directory) while still fully usable and
    // editable in User Management.
    testAccount: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    deletedAt: Date,
    // The user asked (from the app) to have their account deleted. It stays
    // fully active until an ADMIN approves the request — only then is it
    // soft-deleted. Admin can also reject, which clears this and notifies them.
    deletionRequested: { type: Boolean, default: false },
    deletionRequestedAt: Date,
    // Set true when an admin REJECTS a deletion request; shown once as a popup on
    // the user's next login (web + mobile), then cleared.
    deletionRejected: { type: Boolean, default: false },
    // Set true when the deletion happened by APPROVING the user's own request (vs
    // an admin deleting them directly), so the login popup can say the right thing.
    deletionApproved: { type: Boolean, default: false },
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
    branches: [String],
    // This user's manual drag-reorder of their own StormChat list — the SAME
    // list order on web and mobile, since both read it from here (the server
    // is the single source of truth, neither client keeps its own copy).
    // dms/groups are ChatGroup _id strings, in the user's chosen order.
    // A chat not in these arrays (new, or never manually placed) falls back
    // to the existing "most recent message first" order, appended after
    // everything the user HAS manually arranged. Not present/empty = no
    // manual reorder has ever been saved for that list, so recency sort alone
    // still applies exactly as before this feature existed.
    chatOrder: {
      type: new Schema({ dms: [String], groups: [String] }, { _id: false }),
      default: undefined,
    },
    passwordHash: String,
    businessPlan: businessPlanSchema,
    videoUrl: String,
    webPage: webPageSchema,
    publicProfile: { type: publicProfileSchema, required: true },
    featureToggles: { type: Schema.Types.Mixed, required: true },
    acculynxUserId: { type: String, default: null, index: true },
    fcmToken: { type: String, default: '' },
    googleCalendar: googleCalendarSchema
  },
  { timestamps: true }
);

// Unique email only among active (non-deleted) users
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deleted: { $ne: true } } }
);

// Roster/team-picker queries filter by managerId (a manager's own team) and/or
// role (e.g. all sales reps). Index both so those lists — like the Unlock Lesson
// member list — never scan the whole users collection.
userSchema.index({ managerId: 1, role: 1 });
userSchema.index({ role: 1 });

// In dev, hot-reload keeps the previously compiled schema cached under
// models.User, so newly added fields (e.g. deletionRequested/deletionRejected)
// would be silently dropped on write. Drop the cache so the current schema wins.
if (process.env.NODE_ENV !== "production" && (models as any).User) {
  delete (models as any).User;
}

export const UserModel = models.User || model("User", userSchema);
