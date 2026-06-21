const https = require('https');

console.log('🌐 Final check - What does web actually show?');
console.log('');

// Check courses list API (what app uses)
const coursesUrl = 'https://millerstorm.tech/api/courses?userId=ishitapatel3456@gmail.com&userRole=sales';

https.get(coursesUrl, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const courses = JSON.parse(data);
      console.log('📱 APP API RESULTS (what app gets):');
      courses.forEach(course => {
        const progress = course.progress;
        if (progress) {
          console.log(`   ${course.title}: ${progress.progressPercent}%`);
        } else {
          console.log(`   ${course.title}: No progress data`);
        }
      });
      
      console.log('');
      console.log('🌐 Now checking what WEB shows...');
      
      // Check individual progress API
      const progressUrl = 'https://millerstorm.tech/api/progress?userId=ishitapatel3456@gmail.com&courseId=course-1772692234004';
      
      https.get(progressUrl, (res2) => {
        let data2 = '';
        
        res2.on('data', (chunk) => {
          data2 += chunk;
        });
        
        res2.on('end', () => {
          try {
            const progress = JSON.parse(data2);
            const completed = progress.completedPages?.length || 0;
            
            // Find the course to get total pages
            const course = courses.find(c => c.id === 'course-1772692234004');
            const totalPages = course?.pages?.length || 0;
            const webPercent = totalPages > 0 ? Math.round((completed / totalPages) * 100) : 0;
            
            console.log(`🌐 WEB CALCULATION:`);
            console.log(`   Completed pages: ${completed}`);
            console.log(`   Total pages: ${totalPages}`);
            console.log(`   Web would show: ${webPercent}%`);
            console.log('');
            console.log('📊 COMPARISON:');
            console.log(`   App shows: ${course?.progress?.progressPercent || 0}%`);
            console.log(`   Web calculation: ${webPercent}%`);
            
            if (course?.progress?.progressPercent === webPercent) {
              console.log('✅ MATCH! App and web show same percentage');
            } else {
              console.log('❌ MISMATCH! Different percentages');
            }
            
          } catch (e) {
            console.log('❌ Error parsing progress:', e.message);
          }
        });
      });
      
    } catch (e) {
      console.log('❌ Error parsing courses:', e.message);
    }
  });
}).on('error', (e) => {
  console.log('❌ Request error:', e.message);
});