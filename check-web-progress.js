const https = require('https');

// Check what web shows for progress
const userId = 'ishitapatel3456@gmail.com';
const courseIds = 'course-1772692234004,course-1773328848873,course-1773283521827';

const url = `https://millerstorm.tech/api/course-progress?userId=${userId}&courseIds=${courseIds}`;

console.log('🔵 Checking web progress calculation...');
console.log('🔵 URL:', url);

https.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('🔵 Status:', res.statusCode);
    try {
      const progress = JSON.parse(data);
      console.log('✅ Progress data:', JSON.stringify(progress, null, 2));
      
      Object.keys(progress).forEach(courseId => {
        const courseProgress = progress[courseId];
        const completed = courseProgress.completedPages?.length || 0;
        const total = courseProgress.totalPages || 0;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        console.log(`📊 ${courseId}: ${completed}/${total} = ${percent}%`);
      });
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
      console.log('Response:', data);
    }
  });
}).on('error', (e) => {
  console.log('❌ Request error:', e.message);
});