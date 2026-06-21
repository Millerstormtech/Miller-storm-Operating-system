const mongoose = require("mongoose");
require('dotenv').config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";

async function listAllCourses() {
  try {
    await mongoose.connect(uri, { dbName: "millerstorm" });
    console.log("✅ Connected to MongoDB\n");

    const Course = mongoose.model("Course", new mongoose.Schema({}, { strict: false }));

    const courses = await Course.find({}).sort({ order: 1 }).lean();
    console.log(`📚 Total courses in database: ${courses.length}\n`);

    if (courses.length === 0) {
      console.log("❌ No courses found in database!");
    } else {
      courses.forEach((course, index) => {
        console.log(`${index + 1}. ${course.title || 'Untitled'}`);
        console.log(`   ID: ${course.id || 'N/A'}`);
        console.log(`   Status: ${course.status || 'N/A'}`);
        console.log(`   Access: ${course.accessMode || 'N/A'}`);
        console.log(`   Order: ${course.order !== undefined ? course.order : 'N/A'}`);
        console.log(`   Image: ${course.coverImageUrl ? 'YES' : 'NO'}`);
        console.log('');
      });
    }

    await mongoose.disconnect();
    console.log("✅ Done");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

listAllCourses();
