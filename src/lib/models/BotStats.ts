import { Schema, model, models } from "mongoose";

const botStatsSchema = new Schema(
  {
    botId: { type: String, required: true, unique: true },
    botName: { type: String, required: true },
    totalSessions: { type: Number, default: 0 },
    totalMessages: { type: Number, default: 0 },
    lastUpdatedAt: Date,
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const BotStatsModel = models.BotStats || model("BotStats", botStatsSchema);
