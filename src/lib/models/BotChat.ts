import { Schema, model, models } from "mongoose";

const botChatSchema = new Schema({
  chatId: { type: String, required: true, unique: true },
  botId: { type: String, required: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  userRole: { type: String, required: true },
  title: { type: String, default: "New Chat" },
  messages: [{
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    attachments: [{ name: String, url: String, type: String }],
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

botChatSchema.index({ botId: 1, userId: 1, updatedAt: -1 });

export const BotChatModel = models.BotChat || model("BotChat", botChatSchema);
