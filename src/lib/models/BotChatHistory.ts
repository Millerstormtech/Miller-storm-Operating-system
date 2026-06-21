import { Schema, model, models } from "mongoose";

const messageSchema = new Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const botChatHistorySchema = new Schema({
  chatId: { type: String, required: true, unique: true },
  botId: { type: String, required: true },
  userId: { type: String, required: true },
  userName: { type: String },
  userEmail: { type: String },
  userRole: { type: String },
  title: { type: String, default: "New Chat" },
  messages: [messageSchema]
}, { timestamps: true });

botChatHistorySchema.index({ botId: 1, userId: 1 });
botChatHistorySchema.index({ botId: 1 });

export const BotChatHistoryModel = models.BotChatHistory || model("BotChatHistory", botChatHistorySchema);
