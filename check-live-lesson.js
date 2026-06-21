const https = require('https');

async function checkLiveLesson() {
  try {
    // First, get all courses to find the one with "Core Values"
    console.log('🌐 Fetching courses from live server...');
    
    const coursesUrl = 'https://millerstorm.tech/api/courses?userId=ishitapatel3456@gmail.com&userRole=sales';
    
    https.get(coursesUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const courses = JSON.parse(data);
        console.log('\n📚 Total courses:', courses.length);
        
        // Find course with "Core Values" lesson
        let targetCourse = null;
        let targetLesson = null;
        
        for (const course of courses) {
          const lesson = course.pages?.find(p => 
            p.title && p.title.toLowerCase().includes('core values')
          );
          if (lesson) {
            targetCourse = course;
            targetLesson = lesson;
            break;
          }
        }
        
        if (!targetLesson) {
          console.log('❌ Lesson with "core values" not found');
          // Show first lesson as example
          if (courses[0]?.pages?.[0]) {
            targetCourse = courses[0];
            targetLesson = courses[0].pages[0];
            console.log('\n📄 Showing first lesson as example instead');
          } else {
            return;
          }
        }
        
        console.log('\n📚 Course:', targetCourse.title);
        console.log('📄 Course ID:', targetCourse.id);
        console.log('\n📄 Lesson:', targetLesson.title);
        console.log('📄 Lesson ID:', targetLesson.id);
        console.log('\n🎥 Video URL:', targetLesson.videoUrl || 'None');
        console.log('\n📝 Body content length:', targetLesson.body?.length || 0);
        console.log('\n📝 Body content (first 3000 chars):');
        console.log('─'.repeat(80));
        console.log(targetLesson.body?.substring(0, 3000) || 'No content');
        console.log('─'.repeat(80));
        
        if (targetLesson.body && targetLesson.body.length > 3000) {
          console.log('\n... (truncated, total length:', targetLesson.body.length, 'chars)');
          console.log('\n📝 Last 500 chars:');
          console.log('─'.repeat(80));
          console.log(targetLesson.body.substring(targetLesson.body.length - 500));
          console.log('─'.repeat(80));
        }
        
        console.log('\n🔗 Resource Links:', targetLesson.resourceLinks?.length || 0);
        if (targetLesson.resourceLinks?.length > 0) {
          console.log('Links:', JSON.stringify(targetLesson.resourceLinks, null, 2));
        }
        
        console.log('\n📎 File URLs:', targetLesson.fileUrls?.length || 0);
        if (targetLesson.fileUrls?.length > 0) {
          console.log('Files:', JSON.stringify(targetLesson.fileUrls, null, 2));
        }
      });
    }).on('error', (err) => {
      console.error('❌ Error:', err.message);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkLiveLesson();
