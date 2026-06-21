import mongoose, { Schema, model, models } from "mongoose";

const SystemLogSchema = new Schema(
  {
    level: { type: String, enum: ['info', 'warn', 'error', 'debug'], default: 'info' },
    source: { type: String, required: true }, // e.g., 'STORM-CHAT', 'PUSH-NOTIFICATION'
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Auto-delete logs after 7 days to keep DB clean
SystemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

export const SystemLogModel = models.SystemLog || model("SystemLog", SystemLogSchema);

export async function logToDb(level: 'info' | 'warn' | 'error' | 'debug', source: string, message: string, metadata?: any) {
  try {
    // Only log if we are not in a build environment or if explicitly needed
    await SystemLogModel.create({ level, source, message, metadata });
    console.log(`[DB-LOG][${level.toUpperCase()}][${source}] ${message}`);
  } catch (err) {
    console.error('Failed to write log to DB:', err);
  }
}
