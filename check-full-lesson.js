const https = require('https');
const fs = require('fs');

async function checkFullLesson() {
  try {
    console.log('🌐 Fetching courses from live server...');
    
    const coursesUrl = 'https://millerstorm.tech/api/courses?userId=ishitapatel3456@gmail.com&userRole=sales';
    
    https.get(coursesUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const courses = JSON.parse(data);
        
        // Find "The Core Four & Mission" lesson
        let targetLesson = null;
        
        for (const course of courses) {
          const lesson = course.pages?.find(p => 
            p.title && p.title.toLowerCase().includes('core four')
          );
          if (lesson) {
            targetLesson = lesson;
            break;
          }
        }
        
        if (!targetLesson) {
          console.log('❌ Lesson not found');
          return;
        }
        
        console.log('📄 Lesson:', targetLesson.title);
        console.log('📄 Lesson ID:', targetLesson.id);
        
        // Save full body to file
        fs.writeFileSync('lesson-body.html', targetLesson.body || '');
        console.log('\n✅ Full body content saved to lesson-body.html');
        console.log('📝 Body length:', targetLesson.body?.length || 0);
        
        // Extract text content (strip HTML tags)
        const textOnly = (targetLesson.body || '')
          .replace(/<iframe[^>]*>.*?<\/iframe>/gs, '[VIDEO]')
          .replace(/<button[^>]*>.*?<\/button>/gs, '')
          .replace(/<svg[^>]*>.*?<\/svg>/gs, '')
          .replace(/<div[^>]*data-video[^>]*>.*?<\/div>/gs, '[VIDEO CONTAINER]')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        console.log('\n📝 Text content (cleaned):');
        console.log('─'.repeat(80));
        console.log(textOnly.substring(0, 2000));
        console.log('─'.repeat(80));
        
        console.log('\n🔗 Resource Links:', targetLesson.resourceLinks?.length || 0);
        console.log('\n📎 File URLs:', targetLesson.fileUrls?.length || 0);
        if (targetLesson.fileUrls?.length > 0) {
          targetLesson.fileUrls.forEach((file, i) => {
            console.log(`  ${i + 1}. ${file.label} -> ${file.href}`);
          });
        }
      });
    }).on('error', (err) => {
      console.error('❌ Error:', err.message);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkFullLesson();
