import { Schema, model, models } from "mongoose";

// One monthly DMO per person per month (Jay, 2026-10-02): the income goal and
// what they will do that month. Due before midnight on the 1st. The income goal
// has no progress bar (the app cannot see commissions); it drives the claims
// suggestion in src/lib/dmo/rules.ts (incomePlan).
const dmoMonthlySchema = new Schema(
  {
    userId: { type: String, required: true },
    month: { type: String, required: true }, // "YYYY-MM" (Central)
    incomeGoal: { type: Number, required: true },
    commissionPerRoof: { type: Number, required: true },
    doors: { type: Number, required: true },
    claims: { type: Number, required: true },
    contractDollars: { type: Number, required: true },
    submittedAt: { type: Date, required: true },
    late: { type: Boolean, default: false },
  },
  { timestamps: true }
);

dmoMonthlySchema.index({ userId: 1, month: 1 }, { unique: true });

export const DmoMonthlyModel = models.DmoMonthly || model("DmoMonthly", dmoMonthlySchema, "dmo_monthly");
