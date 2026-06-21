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

async function updateCourses() {
  try {
    await mongoose.connect(uri, { dbName: "millerstorm" });
    console.log("✅ Connected to MongoDB");

    const Course = mongoose.model("Course", courseSchema);

    // Fetch all courses
    const courses = await Course.find({});
    console.log(`📚 Found ${courses.length} courses in database`);

    // Update each course with order if not present
    let updateCount = 0;
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const updates = {};
      
      // Add order if missing
      if (course.order === undefined || course.order === null) {
        updates.order = i + 1;
      }
      
      // Add status if missing
      if (!course.status) {
        updates.status = "published";
      }
      
      // Add accessMode if missing
      if (!course.accessMode) {
        updates.accessMode = "open";
      }
      
      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        await Course.updateOne({ _id: course._id }, { $set: updates });
        console.log(`✅ Updated course: ${course.title}`);
        console.log(`   - Added fields:`, updates);
        updateCount++;
      } else {
        console.log(`⏭️  Skipped course: ${course.title} (already has all fields)`);
      }
    }

    console.log(`\n✅ Updated ${updateCount} courses`);
    console.log(`⏭️  Skipped ${courses.length - updateCount} courses (already up to date)`);

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

updateCourses();
