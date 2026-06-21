const mongoose = require("mongoose");

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";

const socialMediaMetricsSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  platform: { type: String, required: true },
  platformName: { type: String, required: true },
  followers: { type: Number, required: true, default: 0 },
  posts30d: { type: Number, required: true, default: 0 },
  views30d: { type: Number, required: true, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

const initialMetrics = [
  {
    id: "social-instagram-1",
    platform: "instagram",
    platformName: "Instagram",
    followers: 18250,
    posts30d: 36,
    views30d: 245000
  },
  {
    id: "social-facebook-1",
    platform: "facebook",
    platformName: "Facebook",
    followers: 9450,
    posts30d: 18,
    views30d: 121000
  },
  {
    id: "social-tiktok-1",
    platform: "tiktok",
    platformName: "TikTok",
    followers: 30420,
    posts30d: 28,
    views30d: 612000
  },
  {
    id: "social-youtube-1",
    platform: "youtube",
    platformName: "YouTube",
    followers: 12780,
    posts30d: 12,
    views30d: 398000
  }
];

async function seedSocialMetrics() {
  try {
    await mongoose.connect(uri, { dbName: "millerstorm" });
    console.log("✅ Connected to MongoDB");

    const SocialMediaMetrics = mongoose.model("SocialMediaMetrics", socialMediaMetricsSchema);

    // Clear existing metrics
    await SocialMediaMetrics.deleteMany({});
    console.log("✅ Cleared existing social media metrics");

    // Insert initial metrics
    await SocialMediaMetrics.insertMany(initialMetrics);
    console.log(`✅ Seeded ${initialMetrics.length} social media metrics`);

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

seedSocialMetrics();
