const mongoose = require("mongoose");
require('dotenv').config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";

const courseSchema = new mongoose.Schema({
  id: String,
  title: String,
  tagline: String,
  description: String,
  status: String,
  accessMode: String,
  order: Number,
  coverImageUrl: String,
  icon: String,
  lessonNames: [String],
  assetFiles: [String],
  marketingDocs: [String],
  difficultyLabel: String,
  timeLabel: String,
  difficultyScore: Number,
  timeScore: Number,
  riskScore: Number,
  capitalScore: Number,
  personalityScore: Number,
  quizQuestions: [mongoose.Schema.Types.Mixed],
  links: [mongoose.Schema.Types.Mixed],
  folders: [mongoose.Schema.Types.Mixed],
  pages: [mongoose.Schema.Types.Mixed]
}, { timestamps: true, strict: false });

const webCourses = [
  {
    id: "million-dollar-playbook",
    title: "Million Dollar Playbook",
    tagline: "Master the complete sales system",
    description: "Learn the complete playbook to build a million dollar roofing business.",
    status: "published",
    accessMode: "open",
    order: 1,
    coverImageUrl: "https://i.ibb.co/9ZQZ9ZQ/million-dollar-playbook.jpg",
    icon: "💰",
    lessonNames: [],
    assetFiles: [],
    marketingDocs: [],
    difficultyLabel: "Medium",
    timeLabel: "Long",
    difficultyScore: 70,
    timeScore: 80,
    riskScore: 30,
    capitalScore: 20,
    personalityScore: 80,
    quizQuestions: [],
    links: [],
    folders: [],
    pages: []
  },
  {
    id: "adjuster-appointment",
    title: "Adjuster Appointment",
    tagline: "Get the adjuster on site",
    description: "Learn how to schedule and manage adjuster appointments effectively.",
    status: "published",
    accessMode: "open",
    order: 2,
    coverImageUrl: "https://i.ibb.co/9ZQZ9ZQ/adjuster-appointment.jpg",
    icon: "📅",
    lessonNames: [],
    assetFiles: [],
    marketingDocs: [],
    difficultyLabel: "Medium",
    timeLabel: "Medium",
    difficultyScore: 60,
    timeScore: 60,
    riskScore: 20,
    capitalScore: 10,
    personalityScore: 70,
    quizQuestions: [],
    links: [],
    folders: [],
    pages: []
  },
  {
    id: "objections-masterclass",
    title: "Objections Masterclass",
    tagline: "Handle any objection with confidence",
    description: "Master the art of handling objections and closing more deals.",
    status: "published",
    accessMode: "open",
    order: 3,
    coverImageUrl: "https://i.ibb.co/9ZQZ9ZQ/objections-masterclass.jpg",
    icon: "🎯",
    lessonNames: [],
    assetFiles: [],
    marketingDocs: [],
    difficultyLabel: "Advanced",
    timeLabel: "Medium",
    difficultyScore: 80,
    timeScore: 60,
    riskScore: 30,
    capitalScore: 5,
    personalityScore: 90,
    quizQuestions: [],
    links: [],
    folders: [],
    pages: []
  }
];

async function addWebCourses() {
  try {
    await mongoose.connect(uri, { dbName: "millerstorm" });
    console.log("✅ Connected to MongoDB\n");

    const Course = mongoose.model("Course", courseSchema);

    // Delete old courses
    await Course.deleteMany({});
    console.log("🗑️  Deleted old courses\n");

    // Add new courses
    for (const course of webCourses) {
      await Course.create(course);
      console.log(`✅ Added: ${course.title}`);
    }

    console.log(`\n✅ Successfully added ${webCourses.length} courses`);

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

addWebCourses();
