import { Schema, model, models } from "mongoose";

const courseAiBotSchema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  // Selected course content for training
  selectedCourses: [{ type: String }],   // course ids
  selectedFolders: [{ type: String }],   // folder ids
  selectedPages: [{ type: String }],     // page ids
  trainingText: { type: String, default: "" },
  // Behaviour
  model: { type: String, default: "gpt-4o-mini" },
  creativity: { type: Number, default: 0 },
  systemPrompt: { type: String, default: "" },
  // Appearance
  botTitle: { type: String, default: "" },
  welcomeMessage: { type: String, default: "Hi! Ask me anything about this course." },
  placeholder: { type: String, default: "Ask about the course..." },
  colorTheme: { type: String, default: "#3b82f6" },
  botAvatarUrl: { type: String, default: "" },
  // Status
  status: { type: String, enum: ['published', 'draft'], default: 'draft' },
  // Stats
  totalMessages: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const CourseAiBotModel = models.CourseAiBot || model("CourseAiBot", courseAiBotSchema);
