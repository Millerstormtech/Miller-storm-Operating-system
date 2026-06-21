const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://localhost:27017/millerstorm';

const courseSchema = new mongoose.Schema({
  id: String,
  title: String,
  order: Number,
  status: String,
  tagline: String,
  description: String,
  coverImageUrl: String
}, { strict: false });

const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);

async function testCourseOrder() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!\n');

    // Fetch all courses
    console.log('Fetching all courses...');
    const courses = await Course.find({}).select('id title order status').lean();
    
    console.log(`Found ${courses.length} courses:\n`);
    courses.forEach((course, index) => {
      console.log(`${index + 1}. ${course.title}`);
      console.log(`   ID: ${course.id}`);
      console.log(`   Order: ${course.order !== undefined ? course.order : 'NOT SET'}`);
      console.log(`   Status: ${course.status || 'N/A'}`);
      console.log('');
    });

    // Test: Set order for all courses
    console.log('\n--- Testing: Setting order for all courses ---');
    const updates = courses.map((course, index) => ({
      updateOne: {
        filter: { id: course.id },
        update: { $set: { order: index } }
      }
    }));

    const result = await Course.bulkWrite(updates);
    console.log(`Updated ${result.modifiedCount} courses with order field\n`);

    // Verify the update
    console.log('Verifying updated courses...');
    const updatedCourses = await Course.find({}).select('id title order').sort({ order: 1 }).lean();
    
    console.log('\nCourses after update (sorted by order):');
    updatedCourses.forEach((course, index) => {
      console.log(`${index + 1}. ${course.title} - Order: ${course.order}`);
    });

    // Test: Swap order of first two courses
    if (updatedCourses.length >= 2) {
      console.log('\n--- Testing: Swapping order of first two courses ---');
      const course1 = updatedCourses[0];
      const course2 = updatedCourses[1];
      
      console.log(`Swapping "${course1.title}" (order: ${course1.order}) with "${course2.title}" (order: ${course2.order})`);
      
      await Course.updateOne({ id: course1.id }, { $set: { order: 1 } });
      await Course.updateOne({ id: course2.id }, { $set: { order: 0 } });
      
      const swappedCourses = await Course.find({}).select('id title order').sort({ order: 1 }).lean();
      console.log('\nCourses after swap:');
      swappedCourses.forEach((course, index) => {
        console.log(`${index + 1}. ${course.title} - Order: ${course.order}`);
      });
    }

    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testCourseOrder();
