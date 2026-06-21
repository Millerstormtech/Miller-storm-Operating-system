const mongoose = require('mongoose');
require('dotenv').config();

const CourseSchema = new mongoose.Schema({}, { strict: false, collection: 'courses' });
const CourseModel = mongoose.model('Course', CourseSchema);

async function checkLessonContent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all courses
    const courses = await CourseModel.find({}).lean();
    console.log('\n📚 Total courses:', courses.length);

    // Search for the lesson across all courses
    let lesson = null;
    let course = null;

    for (const c of courses) {
      const found = c.pages?.find(p => 
        p.title && p.title.toLowerCase().includes('core values')
      );
      if (found) {
        lesson = found;
        course = c;
        break;
      }
    }

    if (!lesson || !course) {
      console.log('❌ Lesson with "core values" not found');
      console.log('\nSearching for any lesson with "miller"...');
      
      for (const c of courses) {
        const found = c.pages?.find(p => 
          p.title && p.title.toLowerCase().includes('miller')
        );
        if (found) {
          lesson = found;
          course = c;
          break;
        }
      }
    }

    if (!lesson || !course) {
      console.log('❌ No matching lesson found');
      // Show first lesson from first course as example
      if (courses[0]?.pages?.[0]) {
        lesson = courses[0].pages[0];
        course = courses[0];
        console.log('\n📄 Showing first lesson as example instead');
      } else {
        return;
      }
    }

    console.log('\n📚 Course:', course.title);
    console.log('📄 Course ID:', course.id);
    console.log('\n📄 Lesson:', lesson.title);
    console.log('📄 Lesson ID:', lesson.id);
    console.log('\n🎥 Video URL:', lesson.videoUrl || 'None');
    console.log('\n📝 Body content length:', lesson.body?.length || 0);
    console.log('\n📝 Body content (first 2000 chars):');
    console.log('─'.repeat(80));
    console.log(lesson.body?.substring(0, 2000) || 'No content');
    console.log('─'.repeat(80));
    
    if (lesson.body && lesson.body.length > 2000) {
      console.log('\n... (truncated, total length:', lesson.body.length, 'chars)');
    }

    console.log('\n🔗 Resource Links:', lesson.resourceLinks?.length || 0);
    console.log('\n📎 File URLs:', lesson.fileUrls?.length || 0);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkLessonContent();
