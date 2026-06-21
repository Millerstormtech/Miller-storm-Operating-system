import { Schema, model, models } from "mongoose";

const businessPlanSchema = new Schema(
  {
    userId: { type: String, required: true },
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
  { timestamps: true }
);

// Try different possible collection names
export const BusinessPlanModel = models.BusinessPlan || model("BusinessPlan", businessPlanSchema);
export const BusinessPlansModel = models.BusinessPlans || model("BusinessPlans", businessPlanSchema);
export const SalesBusinessPlanModel = models.SalesBusinessPlan || model("SalesBusinessPlan", businessPlanSchema);