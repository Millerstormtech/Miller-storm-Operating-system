const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require('dotenv').config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";

const mockUsers = [
  {
    id: "admin-1",
    name: "Alex Morgan",
    email: "alex.morgan@company.com",
    password: "admin123",
    role: "admin",
    strengths: "Strategic vision, leadership, cross-functional execution",
    weaknesses: "Delegation, overcommitting to initiatives",
    headshotUrl: "",
    phone: "555-0100",
    territory: "National",
    publicProfile: {
      showHeadshot: false,
      showEmail: false,
      showPhone: false,
      showStrengths: false,
      showWeaknesses: false,
      showTerritory: false
    },
    webPage: { status: "draft" },
    featureToggles: {
      dashboard: true,
      userManagement: true,
      roleHierarchy: true,
      businessUnits: true,
      salesOverview: true,
      marketingOverview: true,
      courseManagement: true,
      materialsLibrary: true,
      approvalWorkflows: true,
      aiBots: true,
      webTemplates: true,
      featureToggles: true,
      systemSettings: true,
      teamBusinessPlans: true,
      teamFunnelMetrics: true,
      teamTraining: true,
      aiAssistant: true,
      businessPlan: true,
      trainingCenter: true,
      marketingMaterials: true,
      aiChat: true,
      repWebPage: true,
      businessCards: true,
      assetLibrary: true,
      contentApprovals: true,
      socialMetrics: true
    }
  },
  {
    id: "manager-1",
    name: "Brooke Taylor",
    email: "brooke.taylor@company.com",
    password: "manager123",
    role: "manager",
    strengths: "Coaching, pipeline management, recruiting",
    weaknesses: "Time management, saying no",
    headshotUrl: "",
    phone: "555-0200",
    territory: "West Region",
    publicProfile: {
      showHeadshot: false,
      showEmail: false,
      showPhone: false,
      showStrengths: false,
      showWeaknesses: false,
      showTerritory: false
    },
    webPage: { status: "draft" },
    featureToggles: {
      dashboard: true,
      userManagement: true,
      roleHierarchy: true,
      businessUnits: true,
      salesOverview: true,
      marketingOverview: true,
      courseManagement: true,
      materialsLibrary: true,
      approvalWorkflows: true,
      aiBots: true,
      webTemplates: true,
      featureToggles: true,
      systemSettings: true,
      teamBusinessPlans: true,
      teamFunnelMetrics: true,
      teamTraining: true,
      aiAssistant: true,
      businessPlan: true,
      trainingCenter: true,
      marketingMaterials: true,
      aiChat: true,
      repWebPage: true,
      businessCards: true,
      assetLibrary: true,
      contentApprovals: true,
      socialMetrics: true
    }
  },
  {
    id: "sales-1",
    name: "Chris Lee",
    email: "chris.lee@company.com",
    password: "sales123",
    role: "sales",
    managerId: "manager-1",
    strengths: "Door knocking, rapport building, objection handling",
    weaknesses: "Follow-up, admin work",
    headshotUrl: "",
    phone: "555-0300",
    territory: "Denver, CO",
    publicProfile: {
      showHeadshot: false,
      showEmail: false,
      showPhone: false,
      showStrengths: false,
      showWeaknesses: false,
      showTerritory: false
    },
    webPage: { status: "draft" },
    featureToggles: {
      dashboard: true,
      userManagement: true,
      roleHierarchy: true,
      businessUnits: true,
      salesOverview: true,
      marketingOverview: true,
      courseManagement: true,
      materialsLibrary: true,
      approvalWorkflows: true,
      aiBots: true,
      webTemplates: true,
      featureToggles: true,
      systemSettings: true,
      teamBusinessPlans: true,
      teamFunnelMetrics: true,
      teamTraining: true,
      aiAssistant: true,
      businessPlan: true,
      trainingCenter: true,
      marketingMaterials: true,
      aiChat: true,
      repWebPage: true,
      businessCards: true,
      assetLibrary: true,
      contentApprovals: true,
      socialMetrics: true
    }
  },
  {
    id: "marketing-1",
    name: "Dana Smith",
    email: "dana.smith@company.com",
    password: "marketing123",
    role: "marketing",
    strengths: "Content strategy, social campaigns, analytics",
    weaknesses: "Saying no to ad-hoc requests",
    headshotUrl: "",
    phone: "555-0400",
    territory: "Corporate",
    publicProfile: {
      showHeadshot: false,
      showEmail: false,
      showPhone: false,
      showStrengths: false,
      showWeaknesses: false,
      showTerritory: false
    },
    webPage: { status: "draft" },
    featureToggles: {
      dashboard: true,
      userManagement: true,
      roleHierarchy: true,
      businessUnits: true,
      salesOverview: true,
      marketingOverview: true,
      courseManagement: true,
      materialsLibrary: true,
      approvalWorkflows: true,
      aiBots: true,
      webTemplates: true,
      featureToggles: true,
      systemSettings: true,
      teamBusinessPlans: true,
      teamFunnelMetrics: true,
      teamTraining: true,
      aiAssistant: true,
      businessPlan: true,
      trainingCenter: true,
      marketingMaterials: true,
      aiChat: true,
      repWebPage: true,
      businessCards: true,
      assetLibrary: true,
      contentApprovals: true,
      socialMetrics: true
    }
  }
];

const initialCourses = [
  {
    id: "door-knocking",
    title: "Door Knocking Foundations",
    tagline: "Mindset, safety, and on-the-door frameworks.",
    description: "Learn the fundamentals of knocking doors with confidence, safety, and consistency so you can build a reliable pipeline week after week.",
    lessonNames: ["Pre-game routine", "Body language", "Opening lines"],
    assetFiles: ["Door pitch one-pager.pdf", "Territory map template.xlsx"],
    marketingDocs: ["Neighborhood intro letter.docx", "Door hanger template.ai"],
    icon: "🚪",
    difficultyLabel: "Medium",
    timeLabel: "Short",
    difficultyScore: 60,
    timeScore: 40,
    riskScore: 30,
    capitalScore: 10,
    personalityScore: 70,
    status: "published",
    accessMode: "open",
    order: 1,
    coverImageUrl: "https://i.ibb.co/9ZQZ9ZQ/million-dollar-playbook.jpg",
    quizQuestions: [
      {
        id: "dq1",
        prompt: "What is the primary goal of your first 5 seconds at the door?",
        options: [
          "Deliver your full pitch",
          "Build rapport and lower resistance",
          "Ask for a referral",
          "Confirm the homeowner's schedule"
        ],
        correctIndex: 1
      },
      {
        id: "dq2",
        prompt: "Which element most impacts your confidence before a door run?",
        options: [
          "Having snacks",
          "Weather conditions",
          "Pre-game routine and mindset",
          "Number of business cards"
        ],
        correctIndex: 2
      }
    ],
    links: [
      { label: "Door knocking safety guide", href: "#door-safety" },
      { label: "Pre-game checklist", href: "#pregame-checklist" }
    ]
  },
  {
    id: "objections",
    title: "Objection Handling Lab",
    tagline: "Structured responses to the top objections.",
    description: "Drill the top field objections and practice frameworks so you never feel stuck when a homeowner pushes back.",
    lessonNames: ["No interest", "Not home owner", "Too busy"],
    assetFiles: ["Objection flashcards.pdf", "Role-play scripts.docx"],
    marketingDocs: ["Objection rebuttal card.pdf"],
    icon: "🎯",
    difficultyLabel: "Medium",
    timeLabel: "Medium",
    difficultyScore: 70,
    timeScore: 60,
    riskScore: 40,
    capitalScore: 5,
    personalityScore: 80,
    status: "published",
    accessMode: "open",
    order: 2,
    coverImageUrl: "https://i.ibb.co/9ZQZ9ZQ/objections-masterclass.jpg",
    quizQuestions: [
      {
        id: "oq1",
        prompt: "What is the first step when you hear an objection?",
        options: [
          "Talk faster to overcome it",
          "Interrupt with a discount",
          "Acknowledge and label the concern",
          "End the conversation"
        ],
        correctIndex: 2
      }
    ],
    links: [
      { label: "Top 10 objections", href: "#top-objections" },
      { label: "Role-play tips", href: "#roleplay-tips" }
    ]
  }
];

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, required: true },
  managerId: String,
  strengths: String,
  weaknesses: String,
  headshotUrl: String,
  phone: String,
  territory: String,
  passwordHash: String,
  publicProfile: mongoose.Schema.Types.Mixed,
  webPage: mongoose.Schema.Types.Mixed,
  featureToggles: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const courseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  tagline: String,
  description: String,
  lessonNames: [String],
  assetFiles: [String],
  marketingDocs: [String],
  icon: String,
  difficultyLabel: String,
  timeLabel: String,
  difficultyScore: Number,
  timeScore: Number,
  riskScore: Number,
  capitalScore: Number,
  personalityScore: Number,
  status: String,
  accessMode: String,
  order: Number,
  coverImageUrl: String,
  quizQuestions: [mongoose.Schema.Types.Mixed],
  links: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });

async function seed() {
  try {
    await mongoose.connect(uri, { dbName: "millerstorm" });
    console.log("✅ Connected to MongoDB");

    const User = mongoose.model("User", userSchema);
    const Course = mongoose.model("Course", courseSchema);

    await User.deleteMany({});
    await Course.deleteMany({});
    console.log("✅ Cleared existing data");

    const usersWithHash = await Promise.all(
      mockUsers.map(async (user) => {
        const { password, ...rest } = user;
        const passwordHash = await bcrypt.hash(password, 10);
        return { ...rest, passwordHash };
      })
    );

    await User.insertMany(usersWithHash);
    console.log(`✅ Seeded ${usersWithHash.length} users`);

    await Course.insertMany(initialCourses);
    console.log(`✅ Seeded ${initialCourses.length} courses`);

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

seed();
