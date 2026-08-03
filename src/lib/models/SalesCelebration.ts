import { Schema, model, models } from "mongoose";

// One row per announced sales win: the once-ever guard for Storm Bot's claim
// and contract messages. Mirrors CourseCelebration, but keyed on the scoring
// fact's own natural key (`${jobId}:${metric}`) since that is already unique
// per job per event.
//
// The row is inserted BEFORE the message is posted. If we posted first and the
// process died, the next sync would announce the same contract again. Letting
// the unique index be the referee also means two concurrent syncs cannot both
// win the race, which no "check if it exists first" code can guarantee.
//
// It also survives fact deletion: the sync removes won/revenue facts for a job
// that turns Cancelled, so a revived deal re-creates the fact. The ledger row
// persists, so nobody is congratulated twice for the same contract.
const salesCelebrationSchema = new Schema(
  {
    factKey: { type: String, required: true, unique: true }, // `${jobId}:${metric}`
    jobId: { type: String, required: true },
    metric: { type: String, enum: ["filed", "won"], required: true },
    repUserId: { type: String, required: true },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const SalesCelebrationModel =
  models.SalesCelebration || model("SalesCelebration", salesCelebrationSchema);
