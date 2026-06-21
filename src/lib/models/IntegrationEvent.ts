import { Schema, model, models } from "mongoose";

const integrationEventSchema = new Schema(
  {
    externalEventId: { type: String, required: true, unique: true },
    source: { type: String, default: "acculynx" },
    eventType: { type: String, required: true },
    milestoneName: { type: String },
    repName: { type: String, required: true },
    repExternalId: { type: String },
    revenue: { type: Number, default: 0 },
    eventDate: { type: Date },
    rawPayload: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["processed", "duplicate", "failed"], default: "processed" },
    location: { type: String, default: "Unknown" },
    companyName: { type: String, default: "" },
    failureReason: { type: String },
  },
  { timestamps: true }
);

export const IntegrationEventModel =
  models.IntegrationEvent || model("IntegrationEvent", integrationEventSchema);
