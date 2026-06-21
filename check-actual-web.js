const https = require('https');

console.log('🌐 CHECKING ACTUAL WEB PERCENTAGE...');
console.log('');

// Step 1: Check what web's course-progress API returns
const webProgressUrl = 'https://millerstorm.tech/api/course-progress?userId=ishitapatel3456@gmail.com&courseIds=course-1772692234004';

console.log('Step 1: Checking web progress API...');
console.log('URL:', webProgressUrl);

https.get(webProgressUrl, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const progressData = JSON.parse(data);
      console.log('✅ Web progress data:', JSON.stringify(progressData, null, 2));
      
      const courseProgress = progressData['course-1772692234004'];
      if (courseProgress) {
        const completedPages = courseProgress.completedPages?.length || 0;
        console.log('📊 Completed pages from web:', completedPages);
        
        // Step 2: Get course details to calculate percentage
        const coursesUrl = 'https://millerstorm.tech/api/courses';
        
        console.log('');
        console.log('Step 2: Getting course details...');
        
        https.get(coursesUrl, (res2) => {
          let data2 = '';
          
          res2.on('data', (chunk) => {
            data2 += chunk;
          });
          
          res2.on('end', () => {
            try {
              const courses = JSON.parse(data2);
              const course = courses.find(c => c.id === 'course-1772692234004');
              
              if (course) {
                const totalPages = course.pages?.length || 0;
                const webPercentage = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;
                
                console.log('📊 Total pages in course:', totalPages);
                console.log('📊 Web calculation:', `${completedPages}/${totalPages} = ${webPercentage}%`);
                console.log('');
                console.log('🎯 FINAL RESULT:');
                console.log(`   WEB SHOULD SHOW: ${webPercentage}%`);
                console.log(`   APP CURRENTLY SHOWS: 5%`);
                
                if (webPercentage === 5) {
                  console.log('✅ CORRECT! Web and app should both show 5%');
                  console.log('   If web shows 6%, it might be browser cache or different calculation');
                } else {
                  console.log(`❌ MISMATCH! Web should show ${webPercentage}%, not 5%`);
                }
              }
            } catch (e) {
              console.log('❌ Error parsing courses:', e.message);
            }
          });
        });
      }
    } catch (e) {
      console.log('❌ Error parsing progress:', e.message);
      console.log('Raw response:', data);
    }
  });
}).on('error', (e) => {
  console.log('❌ Request error:', e.message);
});