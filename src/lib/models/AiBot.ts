import { Schema, model, models } from "mongoose";

const trainingLinkSchema = new Schema({
  id: String,
  url: String,
  type: { type: String, enum: ["full-website", "webpage", "pdf", "word-doc", "excel-csv", "youtube", "vimeo", "loom"], default: "webpage" },
  status: { type: String, enum: ["trained", "pending", "failed", "no-space"], default: "pending" },
  chars: { type: Number, default: 0 },
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

const qaSchema = new Schema({
  id: String,
  question: String,
  answer: String
}, { _id: false });

const aiBotSchema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['published', 'draft'], default: 'draft' },
  assignedRoles: [{ type: String }],
  // Training data
  trainingLinks: [trainingLinkSchema],
  trainingText: { type: String, default: "" },
  qaItems: [qaSchema],
  // Course training data
  selectedCourses: [{ type: String }],
  selectedFolders: [{ type: String }],
  selectedPages: [{ type: String }],
  courseTrainingText: { type: String, default: "" },
  // Behaviour / Tune AI
  model: { type: String, default: "gpt-4o-mini" },
  creativity: { type: Number, default: 0 },
  systemPrompt: { type: String, default: "" },
  // Appearance
  botTitle: { type: String, default: "" },
  displayMessage: { type: String, default: "" },
  displayMessageEnabled: { type: Boolean, default: false },
  welcomeMessage: { type: String, default: "Hi, How can I help you today?" },
  showWelcomePopup: { type: Boolean, default: true },
  placeholder: { type: String, default: "Ask me anything..." },
  suggestions: [{ type: String }],
  removeSuggestionsAfterFirst: { type: Boolean, default: false },
  colorTheme: { type: String, default: "#3b82f6" },
  botAvatarUrl: { type: String, default: "" },
  leadCollection: { type: Boolean, default: false },
  privacyPolicyEnabled: { type: Boolean, default: true },
  privacyActionText: { type: String, default: "Read our" },
  privacyLinkText: { type: String, default: "Privacy Policy" },
  privacyLink: { type: String, default: "" },
  chatIconSize: { type: Number, default: 60 },
  enterMessage: { type: String, default: "Chat Now" },
  attentionSound: { type: String, default: "None" },
  attentionAnimation: { type: String, default: "None" },
  immediatelyOpenChat: { type: Boolean, default: false },
  // Settings
  isPublic: { type: Boolean, default: false },
  timezone: { type: String, default: "UTC" },
  rateLimit: { type: Boolean, default: false },
  domainRestriction: { type: Boolean, default: false },
  allowedDomains: { type: String, default: "" },
  passwordProtection: { type: Boolean, default: false },
  teamMembers: [{ type: String }],
  teamMemberAccess: { type: Schema.Types.Mixed, default: {} },
  // Order
  sortOrder: { type: Number, default: 0 },
  // Stats
  totalChats: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const AiBotModel = models.AiBot || model("AiBot", aiBotSchema);
