import { Schema, model, models } from "mongoose";

// One weekly DMO commitment per person per week (Jay, 2026-10-02): what a rep,
// Team Lead or Branch Manager says they will do in the week starting `weekOf`.
// It is filled in during the week BEFORE (due Friday 1:00 PM), and their Team
// Lead or Branch Manager may change any number until Friday 5:00 PM; every such
// change is kept in `adjustments` so the screen can show both numbers.
// Rules live in src/lib/dmo/rules.ts.
const adjustmentSchema = new Schema(
  {
    field: { type: String, required: true },
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    byUserId: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const dmoWeeklySchema = new Schema(
  {
    userId: { type: String, required: true },
    weekOf: { type: String, required: true }, // the week's Saturday, "YYYY-MM-DD" (Central)
    doors: { type: Number, required: true },
    claims: { type: Number, required: true },
    contracts: { type: Number, required: true },
    contractDollars: { type: Number, required: true },
    away: {
      type: new Schema({ from: String, to: String, reason: String }, { _id: false }),
      default: null,
    },
    submittedAt: { type: Date, required: true },
    late: { type: Boolean, default: false },
    adjustments: { type: [adjustmentSchema], default: [] },
  },
  { timestamps: true }
);

dmoWeeklySchema.index({ userId: 1, weekOf: 1 }, { unique: true });
dmoWeeklySchema.index({ weekOf: 1 });

export const DmoWeeklyModel = models.DmoWeekly || model("DmoWeekly", dmoWeeklySchema, "dmo_weekly");
