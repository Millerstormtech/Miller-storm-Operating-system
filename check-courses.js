const mongoose = require("mongoose");
require('dotenv').config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";

const courseSchema = new mongoose.Schema({}, { strict: false });

async function checkCourses() {
  try {
    await mongoose.connect(uri, { dbName: "millerstorm" });
    console.log("✅ Connected to MongoDB\n");

    const Course = mongoose.model("Course", courseSchema);

    const courses = await Course.find({}).lean();
    console.log(`📚 Total courses: ${courses.length}\n`);

    courses.forEach((course, index) => {
      console.log(`${index + 1}. ${course.title}`);
      console.log(`   - ID: ${course.id}`);
      console.log(`   - Status: ${course.status || 'NOT SET'}`);
      console.log(`   - Access Mode: ${course.accessMode || 'NOT SET'}`);
      console.log(`   - Order: ${course.order !== undefined ? course.order : 'NOT SET'}`);
      console.log(`   - Cover Image: ${course.coverImageUrl || 'NOT SET'}`);
      console.log('');
    });

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkCourses();
